// Acquire USDC for the depositor by swapping friendbot XLM on the testnet DEX
// via a path-payment-strict-receive to self.
import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";

const HORIZON = "https://horizon-testnet.stellar.org";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC = new Asset("USDC", USDC_ISSUER);
const server = new Horizon.Server(HORIZON);

const data = JSON.parse(readFileSync(new URL("../stellar-address", import.meta.url)));
const dep = data.accounts.find((a) => a.role === "depositor");
const kp = Keypair.fromSecret(dep.secret);

const DEST_AMOUNT = process.argv[2] ?? "400";
const SEND_MAX = process.argv[3] ?? "9000";

const account = await server.loadAccount(kp.publicKey());
const tx = new TransactionBuilder(account, {
  fee: (Number(BASE_FEE) * 5).toString(),
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: SEND_MAX,
      destination: kp.publicKey(),
      destAsset: USDC,
      destAmount: DEST_AMOUNT,
      path: [],
    })
  )
  .setTimeout(120)
  .build();
tx.sign(kp);

try {
  const res = await server.submitTransaction(tx);
  console.log("swap tx:", res.hash);
} catch (e) {
  console.error("FAILED:", JSON.stringify(e?.response?.data?.extras?.result_codes ?? e.message));
  process.exit(1);
}

const reloaded = await server.loadAccount(kp.publicKey());
const usdc = reloaded.balances.find((b) => b.asset_code === "USDC");
const xlm = reloaded.balances.find((b) => b.asset_type === "native");
console.log("depositor USDC:", usdc?.balance, "| XLM:", xlm?.balance);
