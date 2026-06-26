// Replicates the frontend handleDeposit() flow from the CLI:
//   POST /api/prove-deposit -> sign returned XDR with depositor key -> submit
//   -> wait -> discover leaf index. Persists the note to note.json for withdraw.
import { Keypair, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { submitSignedXdr, waitForTransaction, findNoteLeafIndex, POOL_ID } from "./lib.mjs";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3002";
const SEED = Number(process.argv[2] ?? 1003);
const AMOUNT_USDC = process.argv[3] ?? "400";
const amountUnits = (BigInt(AMOUNT_USDC) * 10000000n).toString();

const data = JSON.parse(readFileSync(new URL("../stellar-address", import.meta.url)));
const dep = data.accounts.find((a) => a.role === "depositor");
const kp = Keypair.fromSecret(dep.secret);

console.log(`Deposit ${AMOUNT_USDC} USDC (seed ${SEED}) from ${kp.publicKey()}`);

console.log("→ POST /api/prove-deposit (generating proof, 30-120s)…");
const proveRes = await fetch(`${FRONTEND}/api/prove-deposit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ seed: SEED, amountUnits, stellarAddress: kp.publicKey(), poolId: POOL_ID }),
});
if (!proveRes.ok) {
  console.error("prove-deposit failed:", proveRes.status, await proveRes.text());
  process.exit(1);
}
const proof = await proveRes.json();
console.log("  proof ok. commitment:", proof.noteCommitmentHex.slice(0, 24) + "…");

console.log("→ signing deposit XDR with depositor key…");
const tx = TransactionBuilder.fromXDR(proof.unsignedXdr, Networks.TESTNET);
tx.sign(kp);
const signedXdr = tx.toXDR();

console.log("→ submitting to Stellar testnet…");
const txHash = await submitSignedXdr(signedXdr);
console.log("  tx:", txHash);

console.log("→ waiting for it to mine…");
const minedLedger = await waitForTransaction(txHash);
console.log("  mined in ledger", minedLedger);

console.log("→ discovering note leaf index from pool events…");
const leafIdx = await findNoteLeafIndex(proof.noteCommitmentHex, minedLedger);
console.log("  leaf index:", leafIdx);

const note = {
  seed: SEED,
  blindingHex: proof.noteBlindingHex,
  commitmentHex: proof.noteCommitmentHex,
  amountUnits: proof.amountUnits,
  leafIndex: leafIdx,
  dummyBlindingHex: proof.dummyBlindingHex,
  dummyCommitmentHex: proof.dummyCommitmentHex,
  depositTxHash: txHash,
};
writeFileSync(new URL("../note.json", import.meta.url), JSON.stringify(note, null, 2) + "\n");
console.log("\n✅ Deposit complete. Note saved to note.json:");
console.log(`   ${AMOUNT_USDC} USDC @ leaf ${leafIdx}, tx ${txHash}`);
