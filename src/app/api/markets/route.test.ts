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
    "src/app/api/markets/withdrawals/route.ts",
    "src/app/api/markets/payouts/[payoutId]/claim/route.ts",
  ]) {
    assert.equal(existsSync(join(root, path)), true);
  }

  const listSource = readSource("src/app/api/markets/route.ts");
  const detailSource = readSource("src/app/api/markets/[slug]/route.ts");
  const betSource = readSource("src/app/api/markets/[slug]/bets/route.ts");
  const depositSource = readSource("src/app/api/markets/deposits/route.ts");
  const withdrawalSource = readSource("src/app/api/markets/withdrawals/route.ts");
  const claimSource = readSource("src/app/api/markets/payouts/[payoutId]/claim/route.ts");

  assert.match(listSource, /getServerSession/);
  assert.match(listSource, /listMarkets/);
  assert.match(listSource, /listUserMarketPortfolio/);
  assert.match(listSource, /listNotifications/);
  assert.match(listSource, /getWalletBadgeCounts/);
  assert.match(listSource, /serializeNotification/);
  assert.match(listSource, /includeDemo = false/);
  assert.doesNotMatch(listSource, /NODE_ENV !== "production"/);
  assert.doesNotMatch(listSource, /NEXT_PUBLIC_SHOW_DEMO_MARKETS/);
  assert.match(detailSource, /getMarketBySlug/);
  assert.match(detailSource, /listNotifications/);
  assert.match(detailSource, /getWalletBadgeCounts/);
  assert.match(detailSource, /serializeNotification/);
  assert.match(detailSource, /includeDemo: false/);
  assert.match(detailSource, /Market not found/);
  assert.match(betSource, /createMarketBetIntent/);
  assert.match(betSource, /confirmMarketBet/);
  assert.match(betSource, /emitMarketUserNotification/);
  assert.match(betSource, /proof_ready/);
  assert.match(betSource, /submitted/);
  assert.match(depositSource, /getServerSession/);
  assert.match(depositSource, /createMarketDepositNote/);
  assert.match(depositSource, /emitMarketUserNotification/);
  assert.match(depositSource, /serializeMarketUserNote/);
  assert.match(depositSource, /market_deposit_recorded/);
  assert.match(depositSource, /market_deposit_confirmed/);
  assert.match(depositSource, /Market setup is not active/);
  assert.match(withdrawalSource, /getServerSession/);
  assert.match(withdrawalSource, /prepareWithdrawal/);
  assert.match(withdrawalSource, /submitWithdrawal/);
  assert.match(withdrawalSource, /finalizeWithdrawal/);
  assert.match(withdrawalSource, /getWalletProfileByUserId/);
  assert.match(withdrawalSource, /markMarketNotePendingWithdrawal/);
  assert.match(withdrawalSource, /releaseMarketNotePendingWithdrawal/);
  assert.match(withdrawalSource, /confirmMarketNoteWithdrawal/);
  assert.match(withdrawalSource, /emitMarketUserNotification/);
  assert.match(withdrawalSource, /market_withdraw_confirmed/);
  assert.match(claimSource, /getServerSession/);
  assert.match(claimSource, /claimMarketPayoutNote/);
  assert.match(claimSource, /emitMarketUserNotification/);
  assert.match(claimSource, /serializeMarketPayout/);
  assert.match(claimSource, /serializeMarketUserNote/);
  assert.match(claimSource, /market_payout_claimed/);
  assert.doesNotMatch(claimSource, /payload\.amountUnits/);
});

test("market withdrawal API withdraws only own-wallet market notes through server-side market pool config", () => {
  const withdrawalSource = readSource("src/app/api/markets/withdrawals/route.ts");

  assert.match(withdrawalSource, /intent: "prepare"/);
  assert.match(withdrawalSource, /intent: "submit"/);
  assert.match(withdrawalSource, /intent: "finalize"/);
  assert.match(withdrawalSource, /MARKET_POOL_ID/);
  assert.match(withdrawalSource, /getWalletServerEnv/);
  assert.match(withdrawalSource, /MARKET_POOL_CONTRACT_ID|NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID/);
  assert.match(withdrawalSource, /MARKET_POOL_DEPLOYMENT_LEDGER/);
  assert.match(withdrawalSource, /prove\/withdraw/);
  assert.match(withdrawalSource, /getInternalServiceHeaders/);
  assert.match(withdrawalSource, /fetchJsonWithRetry/);
  assert.match(withdrawalSource, /prover-api \/prove\/withdraw/);
  assert.match(withdrawalSource, /RELAYER_URL/);
  assert.match(withdrawalSource, /\/relay/);
  assert.match(withdrawalSource, /waitForTransaction/);
  assert.match(withdrawalSource, /findNoteLeafIndexInPool/);
  assert.match(withdrawalSource, /recipientStellarAddress: profile\.stellar_public_key/);
  assert.match(withdrawalSource, /poolId: marketPool\.contractId/);
  assert.match(withdrawalSource, /indexingStatus/);
  assert.match(withdrawalSource, /pending_index/);
  assert.match(withdrawalSource, /status: 202/);
  assert.doesNotMatch(withdrawalSource, /payload\.poolId/);
  assert.doesNotMatch(withdrawalSource, /\bstellarSecretKey\b/);
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
  assert.match(depositSource, /Market deposit transaction was rejected during simulation/);
  assert.match(depositSource, /status: 422/);
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
  assert.match(betSource, /markMarketBetPrepared/);
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
  const submitBetSource = betSource.slice(
    betSource.indexOf("async function submitBet"),
    betSource.indexOf("async function finalizeBet"),
  );
  assert.match(submitBetSource, /async function submitBet/);
  assert.match(submitBetSource, /markMarketBetPrepared/);
  assert.doesNotMatch(submitBetSource, /cancelPreparedBet/);
  assert.doesNotMatch(betSource, /retryFetchErrors:\s*false/);
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
  assert.match(payoutSource, /findPoolCommitmentEventInPool/);
  assert.match(payoutSource, /recoverPreparedPayoutSubmission/);
  assert.match(payoutSource, /recoverPreparedConsolidationSubmission/);
  assert.match(payoutSource, /ensureMarketEscrowAspMembership/);
  assert.match(payoutSource, /register-asp-membership/);
  assert.match(payoutSource, /ASP_MEMBERSHIP_ADMIN_SECRET/);
  assert.match(payoutSource, /encryptedPayoutNoteCiphertext/);
  assert.match(payoutSource, /inputNotes/);
  assert.match(payoutSource, /consolidatedCount/);
  assert.match(payoutSource, /remainingCount/);
  assert.match(payoutSource, /tries:\s*18/);
  assert.match(payoutSource, /delayMs:\s*5000/);
  assert.match(payoutSource, /status: "submitted"/);
  assert.match(payoutSource, /finalizeSubmittedPayout/);
  assert.match(payoutSource, /emitMarketPayoutReadyNotification/);
  assert.match(payoutSource, /emitMarketPayoutFailedNotification/);
  assert.doesNotMatch(payoutSource, /executeMarketPayoutBatch/);
  assert.doesNotMatch(payoutSource, /readString\(payload\.txHash\)/);
});

test("market APIs return notification bootstrap state with market payloads", () => {
  const listSource = readSource("src/app/api/markets/route.ts");
  const detailSource = readSource("src/app/api/markets/[slug]/route.ts");

  for (const source of [listSource, detailSource]) {
    assert.match(source, /notifications: notifications\.map\(serializeNotification\)/);
    assert.match(source, /notificationUnreadCount: badges\.unreadNotifications/);
    assert.match(source, /listNotifications\(db, \{ userId: auth\.userId, unreadOnly: false, limit: 20 \}\)/);
    assert.match(source, /getWalletBadgeCounts\(db, \{ userId: auth\.userId \}\)/);
  }
});
