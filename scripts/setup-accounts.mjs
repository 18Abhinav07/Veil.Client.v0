// Generates 1 depositor + 3 recipient Stellar testnet accounts, friendbot-funds
// them, adds a USDC trustline to each, and writes keypairs to ../stellar-address.
// Uses the same @stellar/stellar-sdk the frontend bundles.
import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { writeFileSync } from "node:fs";

const HORIZON = "https://horizon-testnet.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC = new Asset("USDC", USDC_ISSUER);
const server = new Horizon.Server(HORIZON);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fund(pub) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${FRIENDBOT}/?addr=${pub}`);
    if (res.ok) return;
    const body = await res.text();
    // already funded is fine
    if (body.includes("op_already_exists") || body.includes("createAccountAlreadyExist")) return;
    await sleep(1500);
  }
  throw new Error(`friendbot failed for ${pub}`);
}

async function addTrustline(kp) {
  const account = await server.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const res = await server.submitTransaction(tx);
  return res.hash;
}

const roles = ["depositor", "recipient1", "recipient2", "recipient3"];
const accounts = [];

for (const role of roles) {
  const kp = Keypair.random();
  console.log(`[${role}] generated ${kp.publicKey()}`);
  await fund(kp.publicKey());
  console.log(`[${role}] funded`);
  await sleep(1000);
  const hash = await addTrustline(kp);
  console.log(`[${role}] USDC trustline added (${hash})`);
  accounts.push({ role, publicKey: kp.publicKey(), secret: kp.secret() });
}

const out = {
  network: "testnet",
  usdcIssuer: USDC_ISSUER,
  asset: "USDC:" + USDC_ISSUER,
  generatedFor: "CLI replication of frontend deposit/bulk-withdraw",
  accounts,
};
writeFileSync(new URL("../stellar-address", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("\nWrote stellar-address with", accounts.length, "accounts.");
console.log("Depositor:", accounts[0].publicKey);
