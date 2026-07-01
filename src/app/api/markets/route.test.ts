import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("market APIs expose authenticated list, detail, intent, and confirmation routes", () => {
  for (const path of [
    "src/app/api/markets/route.ts",
    "src/app/api/markets/[slug]/route.ts",
    "src/app/api/markets/[slug]/bets/route.ts",
    "src/app/api/markets/deposits/route.ts",
    "src/app/api/markets/payouts/[payoutId]/claim/route.ts",
  ]) {
    assert.equal(existsSync(join(root, path)), true);
  }

  const listSource = readSource("src/app/api/markets/route.ts");
  const detailSource = readSource("src/app/api/markets/[slug]/route.ts");
  const betSource = readSource("src/app/api/markets/[slug]/bets/route.ts");
  const depositSource = readSource("src/app/api/markets/deposits/route.ts");
  const claimSource = readSource("src/app/api/markets/payouts/[payoutId]/claim/route.ts");

  assert.match(listSource, /getServerSession/);
  assert.match(listSource, /listMarkets/);
  assert.match(listSource, /listUserMarketPortfolio/);
  assert.match(listSource, /includeDemo = false/);
  assert.doesNotMatch(listSource, /NODE_ENV !== "production"/);
  assert.doesNotMatch(listSource, /NEXT_PUBLIC_SHOW_DEMO_MARKETS/);
  assert.match(detailSource, /getMarketBySlug/);
  assert.match(detailSource, /includeDemo: false/);
  assert.match(detailSource, /Market not found/);
  assert.match(betSource, /createMarketBetIntent/);
  assert.match(betSource, /confirmMarketBet/);
  assert.match(betSource, /proof_ready/);
  assert.match(betSource, /submitted/);
  assert.match(depositSource, /getServerSession/);
  assert.match(depositSource, /createMarketDepositNote/);
  assert.match(depositSource, /serializeMarketUserNote/);
  assert.match(depositSource, /market_deposit_recorded/);
  assert.match(depositSource, /Market pool is not active/);
  assert.match(claimSource, /getServerSession/);
  assert.match(claimSource, /claimMarketPayoutNote/);
  assert.match(claimSource, /serializeMarketPayout/);
  assert.match(claimSource, /serializeMarketUserNote/);
  assert.match(claimSource, /market_payout_claimed/);
  assert.doesNotMatch(claimSource, /amountUnits/);
});

test("market deposit API prepares submits finalizes and stores notes against isolated market pool config", () => {
  const depositSource = readSource("src/app/api/markets/deposits/route.ts");

  assert.match(depositSource, /intent: "prepare"/);
  assert.match(depositSource, /intent: "submit"/);
  assert.match(depositSource, /intent: "finalize"/);
  assert.match(depositSource, /intent: "store"/);
  assert.match(depositSource, /MARKET_POOL_ID/);
  assert.match(depositSource, /getWalletServerEnv/);
  assert.match(depositSource, /MARKET_POOL_CONTRACT_ID|NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID/);
  assert.match(depositSource, /MARKET_POOL_DEPLOYMENT_LEDGER/);
  assert.match(depositSource, /prove\/deposit/);
  assert.match(depositSource, /getInternalServiceHeaders/);
  assert.match(depositSource, /fetchJsonWithRetry/);
  assert.match(depositSource, /prover-api \/prove\/deposit/);
  assert.match(depositSource, /Market prover is unavailable/);
  assert.match(depositSource, /Start the prover API on port 3001/);
  assert.match(depositSource, /status: 503/);
  assert.match(depositSource, /Stellar RPC is unavailable/);
  assert.doesNotMatch(depositSource, /Check the public wallet USDC balance/);
  assert.match(depositSource, /signingPayloadBase64/);
  assert.match(depositSource, /DecoratedSignature/);
  assert.match(depositSource, /submitSignedXdr/);
  assert.match(depositSource, /waitForTransaction/);
  assert.match(depositSource, /findNoteLeafIndexInPool/);
  assert.match(depositSource, /indexingStatus/);
  assert.match(depositSource, /pending_index/);
  assert.match(depositSource, /status: 202/);
  assert.doesNotMatch(depositSource, /payload\.poolId/);
  assert.doesNotMatch(depositSource, /\bstellarSecretKey\b/);
});

test("market bet API proves submits finalizes and stores escrow transfers against server-side market config", () => {
  const betSource = readSource("src/app/api/markets/[slug]/bets/route.ts");

  assert.match(betSource, /intent === "prepare"/);
  assert.match(betSource, /intent === "submit"/);
  assert.match(betSource, /intent === "finalize"/);
  assert.match(betSource, /MARKET_ESCROW_BN254_PUBLIC_HEX/);
  assert.match(betSource, /MARKET_ESCROW_X25519_PUBLIC_HEX/);
  assert.match(betSource, /getWalletServerEnv/);
  assert.match(betSource, /MARKET_POOL_CONTRACT_ID|contract_id/);
  assert.match(betSource, /prove\/transfer/);
  assert.match(betSource, /getInternalServiceHeaders/);
  assert.match(betSource, /fetchJsonWithRetry/);
  assert.match(betSource, /RELAYER_URL/);
  assert.match(betSource, /\/relay/);
  assert.match(betSource, /markMarketBetSubmitted/);
  assert.match(betSource, /getSubmittedMarketBetRecovery/);
  assert.match(betSource, /resolveBetRecoveryPayload/);
  assert.match(betSource, /cancelPendingMarketBet/);
  assert.match(betSource, /cancelPreparedBet/);
  assert.match(betSource, /waitForTransaction/);
  assert.match(betSource, /findNoteLeafIndexInPool/);
  assert.match(betSource, /confirmMarketBet/);
  assert.match(betSource, /escrowEncryptedNoteCiphertext/);
  assert.match(betSource, /encryptedChangeNoteCiphertext/);
  assert.match(betSource, /pending_index/);
  assert.match(betSource, /status: 202/);
  assert.match(betSource, /escrow:\s*\{\s*status: "submitted"/);
  assert.match(betSource, /poolId: marketPool\.contractId/);
  assert.doesNotMatch(betSource, /payload\.poolId/);
  assert.doesNotMatch(betSource, /MARKET_ESCROW_.*PRIVATE/);
});

test("market admin APIs are restricted and can seed and resolve markets", () => {
  for (const path of [
    "src/app/api/admin/markets/[marketId]/route.ts",
    "src/app/api/admin/markets/[marketId]/payouts/route.ts",
  ]) {
    assert.equal(existsSync(join(root, path)), true);
  }

  const adminSource = readSource("src/app/api/admin/markets/route.ts");
  const marketAdminSource = readSource("src/app/api/admin/markets/[marketId]/route.ts");
  const resolveSource = readSource("src/app/api/admin/markets/[marketId]/resolve/route.ts");
  const payoutSource = readSource("src/app/api/admin/markets/[marketId]/payouts/route.ts");

  assert.match(adminSource, /requireMarketAdmin/);
  assert.match(adminSource, /buildInitialMarketSeeds/);
  assert.match(adminSource, /createPredictionMarketDraft/);
  assert.match(adminSource, /includeDemo: false/);
  assert.doesNotMatch(adminSource, /includeDemo: true/);
  assert.doesNotMatch(adminSource, /payload\.includeDemo !== false/);
  assert.match(adminSource, /ensureMarketPool/);
  assert.match(adminSource, /getWalletServerEnv/);
  assert.match(adminSource, /MARKET_POOL_TREE_DEPTH/);
  assert.match(adminSource, /MARKET_POOL_DEPLOYER_KEY_ID|POOL_DEPLOYER_KEY_ID/);
  assert.match(marketAdminSource, /requireMarketAdmin/);
  assert.match(marketAdminSource, /closeMarketForResolution/);
  assert.match(marketAdminSource, /updatePredictionMarketDraft/);
  assert.match(marketAdminSource, /openPredictionMarketDraft/);
  assert.match(marketAdminSource, /cancelMarket/);
  assert.match(resolveSource, /requireMarketAdmin/);
  assert.match(resolveSource, /resolveMarketAndCreateSettlement/);
  assert.match(resolveSource, /outcome must be YES or NO/);
  assert.match(payoutSource, /requireMarketAdmin/);
  assert.match(payoutSource, /export async function GET/);
  assert.match(payoutSource, /listMarketPayoutQueue/);
  assert.match(payoutSource, /executeMarketPayoutTransfer/);
  assert.match(payoutSource, /getExecutableMarketPayout/);
  assert.match(payoutSource, /getMarketEscrowConsolidationPair/);
  assert.match(payoutSource, /markMarketEscrowConsolidationSubmitted/);
  assert.match(payoutSource, /getSubmittedMarketEscrowConsolidation/);
  assert.match(payoutSource, /confirmSubmittedMarketEscrowConsolidationTransfer/);
  assert.match(payoutSource, /markMarketPayoutSubmitted/);
  assert.match(payoutSource, /getSubmittedMarketPayout/);
  assert.match(payoutSource, /MARKET_ESCROW_BN254_PRIVATE_HEX/);
  assert.match(payoutSource, /MARKET_ESCROW_X25519_PRIVATE_HEX/);
  assert.match(payoutSource, /MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX/);
  assert.match(payoutSource, /getWalletServerEnv/);
  assert.match(payoutSource, /keys\/decrypt-output-note/);
  assert.match(payoutSource, /prove\/transfer/);
  assert.match(payoutSource, /\/relay/);
  assert.match(payoutSource, /waitForTransaction/);
  assert.match(payoutSource, /findNoteLeafIndexInPool/);
  assert.match(payoutSource, /encryptedPayoutNoteCiphertext/);
  assert.match(payoutSource, /inputNotes/);
  assert.match(payoutSource, /consolidatedCount/);
  assert.match(payoutSource, /remainingCount/);
  assert.match(payoutSource, /status: "submitted"/);
  assert.match(payoutSource, /finalizeSubmittedPayout/);
  assert.doesNotMatch(payoutSource, /executeMarketPayoutBatch/);
  assert.doesNotMatch(payoutSource, /readString\(payload\.txHash\)/);
});
