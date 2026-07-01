import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  fetchUsdcBalance,
  findNoteLeafIndex,
  POOL_ID,
  submitSignedXdr,
  waitForTransaction,
} from "./lib.mjs";

const PROVER = process.env.PROVER_API_URL ?? "http://127.0.0.1:3001";
const RELAYER = process.env.RELAYER_URL ?? "http://127.0.0.1:3000";
const SPIKE_FILE = new URL("../lane2-spike-result.json", import.meta.url);

const AMOUNT_USDC = process.env.LANE2_AMOUNT_USDC ?? "200";
const AMOUNT_UNITS = (BigInt(AMOUNT_USDC) * 10_000_000n).toString();
const SENDER_SEED = Number(process.env.LANE2_SENDER_SEED ?? 1008);
const RECIPIENT_SEED = Number(process.env.LANE2_RECIPIENT_SEED ?? 1009);
const DEPOSITOR_ROLE = process.env.LANE2_DEPOSITOR_ROLE ?? "depositor";

const accounts = JSON.parse(readFileSync(new URL("../stellar-address", import.meta.url))).accounts;
const depositor = accounts.find((a) => a.role === DEPOSITOR_ROLE);
const withdrawTo = accounts.find((a) => a.role === "recipient3") ?? accounts.find((a) => a.role.startsWith("recipient"));
if (!depositor) {
  throw new Error(`stellar-address must contain account role ${DEPOSITOR_ROLE}`);
}

const depositorKeypair = Keypair.fromSecret(depositor.secret);
const withdrawToPublicKey = process.env.LANE2_WITHDRAW_TO ?? withdrawTo?.publicKey;
if (!withdrawToPublicKey) {
  throw new Error("Set LANE2_WITHDRAW_TO or provide at least one funded recipient in stellar-address");
}

const runConfig = {
  poolId: POOL_ID,
  senderSeed: SENDER_SEED,
  recipientSeed: RECIPIENT_SEED,
  amountUnits: AMOUNT_UNITS,
  amountUsdc: AMOUNT_USDC,
  depositorRole: DEPOSITOR_ROLE,
  depositor: depositorKeypair.publicKey(),
  withdrawTo: withdrawToPublicKey,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (units) => (Number(units) / 1e7).toFixed(7);

function loadState() {
  if (!existsSync(SPIKE_FILE)) return {};
  const state = JSON.parse(readFileSync(SPIKE_FILE, "utf8"));
  const sameRun = Object.entries(runConfig).every(([key, value]) => state[key] === value);
  return sameRun ? state : {};
}

function saveState(patch) {
  const next = {
    ...loadState(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(SPIKE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function proveWithRetry(path, body, { tries = 12, delayMs = 5000 } = {}) {
  let last = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await postJson(`${PROVER}${path}`, body);
    } catch (error) {
      last = String(error?.message ?? error);
      const transient = /422:|out of range|not been indexed|only has \d+ commitments|indexed yet|root/i.test(last);
      if (transient && attempt < tries) {
        console.log(`  ${path} lagging (attempt ${attempt}/${tries}), waiting ${delayMs / 1000}s`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${path} exhausted retries: ${last}`);
}

async function relayWithRetry(relayBody, { tries = 18, delayMs = 5000 } = {}) {
  let last = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    const response = await fetch(`${RELAYER}/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relayBody),
    });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    last = text;
    const transient = /"class"\s*:\s*"unknown_root"|Error\(Contract,\s*#8\)|UnknownRoot|unknown root|invalid root/i.test(text);
    if (response.status === 422 && transient && attempt < tries) {
      console.log(`  relayer lagging (attempt ${attempt}/${tries}), waiting ${delayMs / 1000}s`);
      await sleep(delayMs);
      continue;
    }
    throw new Error(`relayer failed ${response.status}: ${text}`);
  }
  throw new Error(`relayer exhausted retries: ${last}`);
}

async function depositFreshNote(state) {
  if (state.deposit?.leafIndex !== undefined) return state.deposit;

  console.log(`1. Deposit ${AMOUNT_USDC} USDC into pool as note seed ${SENDER_SEED}`);
  const proof = await proveWithRetry("/prove/deposit", {
    seed: SENDER_SEED,
    amountUnits: AMOUNT_UNITS,
    stellarAddress: depositorKeypair.publicKey(),
    poolId: POOL_ID,
  });

  const tx = TransactionBuilder.fromXDR(proof.unsignedXdr, Networks.TESTNET);
  tx.sign(depositorKeypair);
  const depositTxHash = await submitSignedXdr(tx.toXDR());
  const minedLedger = await waitForTransaction(depositTxHash);
  const leafIndex = await findNoteLeafIndex(proof.noteCommitmentHex, minedLedger);

  const deposit = {
    seed: SENDER_SEED,
    amountUnits: proof.amountUnits,
    blindingHex: proof.noteBlindingHex,
    commitmentHex: proof.noteCommitmentHex,
    leafIndex,
    txHash: depositTxHash,
    minedLedger,
  };
  saveState({ deposit });
  console.log(`   deposit tx ${depositTxHash}, note leaf ${leafIndex}`);
  return deposit;
}

async function transferLane2(state, deposit) {
  if (state.transfer?.recipientLeafIndex !== undefined) return state.transfer;

  console.log(`2. Lane 2 transfer ${AMOUNT_USDC} USDC note -> recipient seed ${RECIPIENT_SEED}`);
  const proof = await proveWithRetry("/prove/transfer", {
    seed: deposit.seed,
    noteBlindingHex: deposit.blindingHex,
    noteAmountUnits: deposit.amountUnits,
    noteLeafIndex: deposit.leafIndex,
    transferAmountUnits: AMOUNT_UNITS,
    recipientSeed: RECIPIENT_SEED,
    poolId: POOL_ID,
  });

  if (proof.relayBody.extData.extAmount !== "0") {
    throw new Error(`Lane 2 proof returned nonzero extAmount: ${proof.relayBody.extData.extAmount}`);
  }
  if (proof.relayBody.extData.recipient !== POOL_ID) {
    throw new Error(`Lane 2 extData recipient is not pool id: ${proof.relayBody.extData.recipient}`);
  }

  const { txHash } = await relayWithRetry(proof.relayBody);
  const minedLedger = await waitForTransaction(txHash);
  const recipientLeafIndex = await findNoteLeafIndex(proof.recipientNoteCommitmentHex, minedLedger);

  const transfer = {
    txHash,
    minedLedger,
    extAmount: proof.relayBody.extData.extAmount,
    extRecipient: proof.relayBody.extData.recipient,
    recipientSeed: RECIPIENT_SEED,
    recipientAmountUnits: proof.recipientAmountUnits,
    recipientBlindingHex: proof.recipientNoteBlindingHex,
    recipientCommitmentHex: proof.recipientNoteCommitmentHex,
    recipientLeafIndex,
    senderChangeAmountUnits: proof.senderChangeAmountUnits,
    senderChangeCommitmentHex: proof.senderChangeCommitmentHex,
    publicAmountHex: proof.relayBody.public.publicAmount,
  };
  saveState({ transfer });
  console.log(`   transfer tx ${txHash}, recipient note leaf ${recipientLeafIndex}, extAmount ${transfer.extAmount}`);
  return transfer;
}

async function withdrawReceivedNote(state, transfer) {
  if (state.withdraw?.txHash) return state.withdraw;

  console.log(`3. Withdraw received Lane 2 note to Stellar address ${withdrawToPublicKey}`);
  const beforeBalance = await fetchUsdcBalance(withdrawToPublicKey);
  const proof = await proveWithRetry("/prove/withdraw", {
    seed: transfer.recipientSeed,
    noteBlindingHex: transfer.recipientBlindingHex,
    noteAmountUnits: transfer.recipientAmountUnits,
    noteLeafIndex: transfer.recipientLeafIndex,
    withdrawAmountUnits: transfer.recipientAmountUnits,
    recipientStellarAddress: withdrawToPublicKey,
    poolId: POOL_ID,
  });

  const { txHash } = await relayWithRetry(proof.relayBody);
  const minedLedger = await waitForTransaction(txHash);
  await sleep(8000);
  const afterBalance = await fetchUsdcBalance(withdrawToPublicKey);

  const withdraw = {
    txHash,
    minedLedger,
    withdrawTo: withdrawToPublicKey,
    beforeBalance,
    afterBalance,
    expectedDelta: fmt(transfer.recipientAmountUnits),
    actualDelta: (Number(afterBalance) - Number(beforeBalance)).toFixed(7),
    extAmount: proof.relayBody.extData.extAmount,
  };
  saveState({ withdraw });
  console.log(`   withdraw tx ${txHash}, balance ${beforeBalance} -> ${afterBalance}`);
  return withdraw;
}

const initialState = saveState({
  scenario: "Lane 2 200 USDC private note-to-note transfer, then recipient withdraw",
  ...runConfig,
});

const deposit = await depositFreshNote(initialState);
const transfer = await transferLane2(loadState(), deposit);
const withdraw = await withdrawReceivedNote(loadState(), transfer);

const pass =
  transfer.extAmount === "0" &&
  transfer.extRecipient === POOL_ID &&
  withdraw.actualDelta === withdraw.expectedDelta;

saveState({
  pass,
  verification: {
    lane2ExtAmountZero: transfer.extAmount === "0",
    lane2ExtRecipientIsPool: transfer.extRecipient === POOL_ID,
    recipientCanRedeemReceivedNote: withdraw.actualDelta === withdraw.expectedDelta,
  },
});

console.log("\n── Lane 2 spike result ──");
console.log(`Lane 2 transfer tx: ${transfer.txHash}`);
console.log(`Recipient-note leaf: ${transfer.recipientLeafIndex}`);
console.log(`Withdraw tx: ${withdraw.txHash}`);
console.log(`Withdraw balance delta: ${withdraw.actualDelta} USDC`);
console.log(pass ? "PASS: Lane 2 note-to-note transfer was redeemed successfully." : "FAIL: see lane2-spike-result.json");

if (!pass) process.exit(1);
