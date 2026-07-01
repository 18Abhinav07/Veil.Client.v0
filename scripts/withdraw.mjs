// Replicates the frontend handleBulkWithdraw() flow from the CLI:
//   for each recipient: POST /api/prove-withdraw -> POST relayer /relay
//   -> wait + discover change-note leaf -> chain into next step.
//
// Hardened vs. the naive version:
//   1. The change-note state (blinding/amount/leaf/dummy) for the NEXT step is
//      persisted to withdraw-state.json the instant a relay succeeds. The change
//      blinding is random and otherwise unrecoverable — if the process dies after
//      a relay but before persisting, those change funds are stranded. Persist
//      first, chain second.
//   2. prove-withdraw is retried through RPC indexing lag: the prover rebuilds the
//      Merkle tree from getEvents on a load-balanced node that may trail the node
//      that saw our previous relay. A 422 "out of range" / "not been indexed yet"
//      is transient — back off and retry rather than aborting the chain.
//   3. Resumable: on start, if withdraw-state.json exists for this note it resumes
//      from the persisted step instead of re-spending from the top.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { waitForTransaction, findNoteLeafIndex, fetchUsdcBalance, POOL_ID } from "./lib.mjs";
import { evaluateRecipientDeltas, isCompletedLane1State } from "./smoke-evidence.mjs";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3002";
const RELAYER = process.env.RELAYER_URL ?? "http://127.0.0.1:3000";
const WITHDRAW_USDC = process.argv[2] ?? "100";
const withdrawUnits = (BigInt(WITHDRAW_USDC) * 10000000n).toString();

const STATE_URL = new URL("../withdraw-state.json", import.meta.url);
const data = JSON.parse(readFileSync(new URL("../stellar-address", import.meta.url)));
const note = JSON.parse(readFileSync(new URL("../note.json", import.meta.url)));
const recipients = data.accounts.filter((a) => a.role.startsWith("recipient"));

const fmt = (u) => (Number(u) / 1e7).toFixed(7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function saveState(state) {
  writeFileSync(STATE_URL, JSON.stringify(state, null, 2) + "\n");
}

// prove-withdraw, retried through RPC indexing lag. The prover reconstructs the
// pool tree from getEvents off a load-balanced node that can trail the node that
// saw our last relay, yielding a transient "leaf out of range" / "not indexed".
async function proveWithdraw(body, { tries = 12, delayMs = 5000 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(`${FRONTEND}/api/prove-withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    const transient =
      res.status === 422 &&
      /out of range|not been indexed|only has \d+ commitments|indexed yet/i.test(text);
    if (transient && attempt < tries) {
      console.log(`    prove-withdraw lagging (attempt ${attempt}/${tries}), waiting ${delayMs / 1000}s — ${text.slice(0, 120)}`);
      await sleep(delayMs);
      continue;
    }
    throw new Error(`prove-withdraw failed: ${res.status} ${text}`);
  }
  throw new Error("prove-withdraw exhausted retries");
}

// relay, retried through the same RPC indexing lag at the simulation layer. When
// step N spends the change note created by step N-1, the node simulating the relay
// can trail the node that saw the previous relay, so the pool's on-chain root set
// doesn't yet include the (valid) root the prover used, so the pool rejects with
// UnknownRoot / Error(Contract, #8) / SIMULATION_REJECTED. The proof is genuinely
// valid; the SAME relayBody will pass once the relayer lands on a caught-up node,
// so retry the identical body (no re-prove) with backoff. Error(Contract, #0) is
// verifier invalid_proof and must fail fast.
async function relayWithRetry(relayBody, { tries = 18, delayMs = 5000 } = {}) {
  let lastText = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(`${RELAYER}/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relayBody),
    });
    if (res.ok) return res.json();
    lastText = await res.text();
    const transient =
      res.status === 422 &&
      /"class"\s*:\s*"unknown_root"|Error\(Contract,\s*#8\)|UnknownRoot|unknown root|invalid root/i.test(lastText);
    if (transient && attempt < tries) {
      console.log(`    relay simulation lagging (attempt ${attempt}/${tries}), waiting ${delayMs / 1000}s — ${lastText.slice(0, 120)}`);
      await sleep(delayMs);
      continue;
    }
    throw new Error(`relayer failed: ${res.status} ${lastText}`);
  }
  throw new Error(`relayer exhausted retries: ${lastText}`);
}

console.log(`Bulk withdraw: ${WITHDRAW_USDC} USDC → ${recipients.length} recipients`);
console.log(`Spending note: ${fmt(note.amountUnits)} USDC @ leaf ${note.leafIndex} (seed ${note.seed})\n`);

// Resume from persisted state if it matches this note, else start fresh from the note.
let state;
if (existsSync(STATE_URL)) {
  const prev = JSON.parse(readFileSync(STATE_URL));
  if (isCompletedLane1State(prev, note, recipients)) {
    console.log(`Existing withdraw-state.json shows this note already completed ${recipients.length}/${recipients.length} Lane 1 steps.`);
    console.log("Relay txs:");
    for (const relay of prev.relays ?? []) {
      console.log(`  step ${relay.step}: ${relay.txHash}`);
    }
    process.exit(0);
  }
  if (prev.noteCommitmentHex === note.commitmentHex && prev.nextStep < recipients.length) {
    state = prev;
    console.log(`Resuming from step ${state.nextStep + 1} (persisted change ${fmt(state.currentAmount)} USDC @ leaf ${state.currentLeaf})\n`);
  }
}
if (!state) {
  state = {
    noteCommitmentHex: note.commitmentHex,
    nextStep: 0,
    currentBlinding: note.blindingHex,
    currentAmount: note.amountUnits,
    currentLeaf: note.leafIndex,
    currentDummyBlinding: note.dummyBlindingHex,
    relays: [],
  };
}

const startStep = state.nextStep;
const before = {};
for (const r of recipients.slice(startStep)) {
  before[r.publicKey] = await fetchUsdcBalance(r.publicKey);
}

for (let i = state.nextStep; i < recipients.length; i++) {
  const rec = recipients[i];
  const step = `Step ${i + 1}/${recipients.length}`;
  console.log(`${step}: send ${WITHDRAW_USDC} USDC → ${rec.publicKey.slice(0, 8)}… (spending leaf ${state.currentLeaf})`);

  const result = await proveWithdraw({
    seed: note.seed,
    noteBlindingHex: state.currentBlinding,
    noteAmountUnits: state.currentAmount,
    noteLeafIndex: state.currentLeaf,
    dummyBlindingHex: state.currentDummyBlinding,
    withdrawAmountUnits: withdrawUnits,
    recipientStellarAddress: rec.publicKey,
    poolId: POOL_ID,
  });
  console.log(`  proof ok → submitting via relayer…`);

  const { txHash } = await relayWithRetry(result.relayBody);
  console.log(`  relayed: ${txHash}`);

  // PERSIST FIRST: the change blinding is random and unrecoverable. Write the
  // next-step state before doing anything else so a crash here can't strand it.
  const changeAmount = result.changeAmountUnits;
  state.nextStep = i + 1;
  state.currentBlinding = result.changeNoteBlindingHex;
  state.currentAmount = changeAmount;
  state.currentLeaf = state.currentLeaf + 2; // optimistic; refined below
  state.currentDummyBlinding = result.nextDummyBlindingHex;
  state.changeNoteCommitmentHex = result.changeNoteCommitmentHex;
  state.relays.push({ step: i + 1, recipient: rec.publicKey, txHash, changeAmount });
  saveState(state);

  const isLast = i === recipients.length - 1;
  if (!isLast && BigInt(changeAmount) > 0n) {
    const minedLedger = await waitForTransaction(txHash);
    const changeLeaf = await findNoteLeafIndex(result.changeNoteCommitmentHex, minedLedger);
    state.currentLeaf = changeLeaf;
    saveState(state);
  }
  console.log(`  change ${fmt(changeAmount)} USDC @ leaf ${state.currentLeaf}\n`);
}

console.log("Waiting ~8s for final balances to settle…");
await sleep(8000);

console.log("\n── Recipient USDC balances ──");
const after = {};
for (const r of recipients.slice(startStep)) {
  after[r.publicKey] = await fetchUsdcBalance(r.publicKey);
}
const evidence = evaluateRecipientDeltas({
  recipients,
  before,
  after,
  expectedDelta: WITHDRAW_USDC,
  startIndex: startStep,
});
let allGood = evidence.length > 0;
for (const row of evidence) {
  if (!row.ok) allGood = false;
  const signedDelta = Number(row.actualDelta) >= 0 ? `+${row.actualDelta}` : row.actualDelta;
  console.log(`  ${row.publicKey}: ${row.before} → ${row.after}  (Δ ${signedDelta}) ${row.ok ? "✅" : "❌"}`);
}
console.log(allGood ? "\n✅ All recipients received the expected amount." : "\n❌ Mismatch — see above.");
if (!allGood) process.exit(1);
