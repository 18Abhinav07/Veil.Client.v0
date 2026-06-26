// One-off: buy USDC for the depositor on testnet SDEX via a self path-payment
// (strict-receive). Needed because the depositor drains its USDC into the pool
// on each deposit. Usage: node scripts/fund-usdc.mjs <usdcAmount> [sendMaxXlm]
import { readFileSync } from "node:fs";
import { Keypair, TransactionBuilder, Networks, Operation, Asset, Horizon } from "@stellar/stellar-sdk";

const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const AMOUNT = process.argv[2] ?? "400";
const SEND_MAX = process.argv[3] ?? "5000";

const data = JSON.parse(readFileSync(new URL("../stellar-address", import.meta.url)));
const dep = data.accounts.find((a) => a.role === "depositor");
const kp = Keypair.fromSecret(dep.secret);
const usdc = new Asset("USDC", USDC_ISSUER);

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const account = await server.loadAccount(kp.publicKey());

const tx = new TransactionBuilder(account, {
  fee: "100000",
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: SEND_MAX,
      destination: kp.publicKey(),
      destAsset: usdc,
      destAmount: AMOUNT,
      path: [],
    })
  )
  .setTimeout(60)
  .build();

tx.sign(kp);
console.log(`Buying ${AMOUNT} USDC (sendMax ${SEND_MAX} XLM)…`);
const res = await server.submitTransaction(tx);
console.log("tx:", res.hash, "ledger:", res.ledger);

const after = await server.loadAccount(kp.publicKey());
const bal = after.balances.find((b) => b.asset_code === "USDC");
console.log("USDC balance now:", bal ? bal.balance : "NONE");
