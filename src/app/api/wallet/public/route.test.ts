import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("public wallet APIs support account status, Friendbot funding, and signed transaction relay", () => {
  const accountRoute = readFileSync(
    join(root, "src", "app", "api", "wallet", "public", "account", "route.ts"),
    "utf8",
  );
  const friendbotRoute = readFileSync(
    join(root, "src", "app", "api", "wallet", "public", "friendbot", "route.ts"),
    "utf8",
  );
  const txRoute = readFileSync(
    join(root, "src", "app", "api", "wallet", "public", "transactions", "route.ts"),
    "utf8",
  );
  const marketRoute = readFileSync(
    join(root, "src", "app", "api", "wallet", "public", "market", "route.ts"),
    "utf8",
  );

  assert.match(accountRoute, /parseHorizonAccount/);
  assert.match(accountRoute, /try\s*\{/);
  assert.match(accountRoute, /catch \(err\)/);
  assert.match(accountRoute, /Public account Horizon lookup failed/);
  assert.match(accountRoute, /return NextResponse\.json\(parseHorizonAccount\(null\)\)/);
  assert.match(friendbotRoute, /friendbot\.stellar\.org/);
  assert.match(friendbotRoute, /getServerSession/);
  assert.match(txRoute, /Horizon\.Server/);
  assert.match(txRoute, /export async function GET/);
  assert.match(txRoute, /TransactionBuilder/);
  assert.match(txRoute, /Operation\.changeTrust/);
  assert.match(txRoute, /Operation\.payment/);
  assert.match(txRoute, /swapXlmToUsdc/);
  assert.match(txRoute, /strictSendPaths/);
  assert.match(txRoute, /Operation\.pathPaymentStrictSend/);
  assert.match(txRoute, /sendAmount/);
  assert.match(txRoute, /destMin/);
  assert.match(txRoute, /slippageBps/);
  assert.doesNotMatch(txRoute, /pathPaymentStrictReceive/);
  assert.doesNotMatch(txRoute, /sendMax/);
  assert.doesNotMatch(txRoute, /destAmount/);
  assert.match(txRoute, /assertXlmSpendable/);
  assert.match(txRoute, /server\.root\(\)/);
  assert.match(txRoute, /base_reserve_in_stroops/);
  assert.match(txRoute, /submitTransaction/);
  assert.match(txRoute, /findWalletProfileForContact/);
  assert.match(txRoute, /createPublicTransaction/);
  assert.match(txRoute, /listPublicTransactions/);
  assert.match(txRoute, /resolvedRecipient/);
  assert.match(txRoute, /DecoratedSignature/);
  assert.match(txRoute, /getServerSession/);
  assert.doesNotMatch(txRoute, /stellarSecretKey/);
  assert.match(marketRoute, /trade_aggregations/);
  assert.match(marketRoute, /base_asset_type:\s*"native"/);
  assert.match(marketRoute, /counter_asset_code:\s*USDC_CODE/);
  assert.match(marketRoute, /counter_asset_issuer:\s*USDC_ISSUER/);
  assert.match(marketRoute, /pair:\s*"XLM\/USDC"/);
  assert.match(marketRoute, /changePct/);
  assert.match(marketRoute, /points/);
});
