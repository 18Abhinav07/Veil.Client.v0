import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("unified wallet dashboard renders the premium wallet surface instead of embedded console pages", () => {
  const source = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const sidebarSource = readSource("src/components/unified/Sidebar.tsx");
  const publicSource = readSource("src/components/unified/PublicDashboard.tsx");
  const privateSource = readSource("src/components/unified/PrivateDashboard.tsx");
  const privateActivitySource = readSource("src/components/unified/PrivateActivity.tsx");

  assert.match(source, /PublicDashboard/);
  assert.match(source, /PrivateDashboard/);
  assert.match(source, /PrivateActivity/);
  assert.match(source, /ContactsTab/);
  assert.match(source, /RequestsTab/);
  assert.match(source, /VaultControls/);
  assert.doesNotMatch(source, /WalletHome/);
  assert.doesNotMatch(source, /PrivatePaymentsHome/);
  assert.match(publicSource, /handleSwapTokens/);
  assert.match(publicSource, /\/api\/wallet\/public\/market/);
  assert.match(publicSource, /activeFormTab/);
  assert.match(publicSource, /slippageBps/);
  assert.match(publicSource, /Minimum receive/);
  assert.doesNotMatch(publicSource, /toggleSwapDirection/);
  assert.doesNotMatch(publicSource, /swapSellAsset/);
  assert.match(privateSource, /activeRightTab/);
  assert.match(privateSource, /handleDeposit/);
  assert.match(privateSource, /handlePrivateSend/);
  assert.match(privateSource, /sendMode/);
  assert.match(privateSource, /Public wallet/);
  assert.match(privateSource, /Private transfer/);
  assert.doesNotMatch(privateSource, /Direct-2-Wallet/);
  assert.doesNotMatch(privateSource, /Note-2-Note/);
  assert.doesNotMatch(privateSource, />Public address</);
  assert.doesNotMatch(privateSource, />VEIL user</);
  assert.match(privateSource, /lane2_transfer/);
  assert.match(privateSource, /\/api\/wallet\/resolve/);
  assert.match(privateSource, /\/api\/wallet\/contacts/);
  assert.match(privateSource, /resolveDirectRecipient/);
  assert.match(privateSource, /recipientNotePublicHex/);
  assert.match(privateSource, /recipientX25519PublicHex/);
  assert.match(privateSource, /claimIncomingNotes/);
  assert.match(privateSource, /\/api\/wallet\/incoming-notes/);
  assert.match(privateSource, /\/api\/wallet\/keys\/decrypt-output-note/);
  assert.match(privateSource, /source: "received"/);
  assert.match(privateSource, /runJobFromNote/);
  assert.match(privateSource, /notePrivateKeyHex/);
  assert.match(privateSource, /membershipBlindingHex/);
  assert.match(privateSource, /saveEncryptedNote/);
  assert.match(privateSource, /MAX_INTERACTIVE_RECIPIENTS/);
  assert.match(privateSource, /backgroundConsent/);
  assert.match(privateSource, /executionPackage/);
  assert.match(privateSource, /expectedOutputCommitmentHex/);
  assert.match(privateSource, /interactiveSpendInFlight/);
  assert.match(privateSource, /interactiveSpendInFlightRef/);
  assert.match(privateSource, /addEventListener\("beforeunload"/);
  assert.doesNotMatch(privateSource, /coming soon/);
  assert.doesNotMatch(privateActivitySource, /EventSource\("\/api\/wallet\/private\/spend-jobs\/events"\)/);
  assert.match(privateActivitySource, /useWalletRealtimeEvent/);
  assert.match(privateActivitySource, /handleResumeJob/);
  assert.match(privateActivitySource, /hasQueuedStepToResume/);
  assert.match(privateActivitySource, /hasProofReadyStepToResume/);
  assert.match(privateActivitySource, /interruptedInteractiveJob/);
  assert.match(privateActivitySource, /beforeunload/);
  assert.match(privateActivitySource, /addEventListener\("beforeunload"/);
  assert.match(privateActivitySource, /removeEventListener\("beforeunload"/);
  assert.match(privateActivitySource, /Private transaction in progress/);
  assert.match(privateActivitySource, /handleReconcileJob/);
  assert.doesNotMatch(privateActivitySource, /hasSubmittedStepToReconcile/);
  assert.match(privateActivitySource, /canReconcileSpendJob\(job\)/);
  assert.match(privateActivitySource, /job\.job\.status === "needs_reconcile"/);
  assert.doesNotMatch(privateActivitySource, /\["submitted", "relaying", "retry_wait", "needs_reconcile"\]\.includes\(step\.status\)/);
  assert.match(privateActivitySource, /\/api\/wallet\/private\/spend-jobs\/\$\{latestJob\.job\.id\}\/reconcile/);
  assert.match(privateActivitySource, /onClick=\{\(\) => void handleResumeJob\(job\)\}/);
  assert.match(privateActivitySource, /onClick=\{\(\) => void handleReconcileJob\(job\)\}/);
  assert.match(privateActivitySource, /Proof/);
  assert.match(privateActivitySource, /Relay/);
  assert.match(privateActivitySource, /Mined/);
  assert.match(privateActivitySource, /Indexed/);
  assert.match(privateActivitySource, /Stored/);
  assert.doesNotMatch(privateActivitySource, /ActivityDetailModal/);
  assert.doesNotMatch(privateActivitySource, /aria-modal/);
  assert.match(sidebarSource, /Contacts/);
  assert.match(sidebarSource, /Requests/);
  assert.match(sidebarSource, /badges/);
  assert.match(sidebarSource, /contactRequests/);
  assert.match(sidebarSource, /paymentRequests/);
});

test("contacts and requests wallet surfaces are wired into the unified app", () => {
  const contactsSource = readSource("src/components/unified/ContactsTab.tsx");
  const requestsSource = readSource("src/components/unified/RequestsTab.tsx");
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const realtimeProviderSource = readSource("src/components/unified/WalletRealtimeProvider.tsx");
  const publicActivitySource = readSource("src/components/unified/PublicActivity.tsx");
  const publicDashboardSource = readSource("src/components/unified/PublicDashboard.tsx");

  assert.match(contactsSource, /\/api\/wallet\/contacts/);
  assert.match(contactsSource, /Incoming requests/);
  assert.match(contactsSource, /Accepted contacts/);
  assert.match(contactsSource, /Outgoing pending/);
  assert.match(requestsSource, /\/api\/wallet\/requests/);
  assert.match(requestsSource, /encryptRequestMemo/);
  assert.match(requestsSource, /decryptRequestMemo/);
  assert.match(requestsSource, /Pay privately/);
  assert.doesNotMatch(requestsSource, /Note-2-Note/);
  assert.match(requestsSource, /paidSpendJobId/);
  assert.match(publicActivitySource, /\/api\/wallet\/public\/transactions/);
  assert.match(publicActivitySource, /PublicTransactionView/);
  assert.doesNotMatch(publicActivitySource, /Public history coming next/);
  assert.match(publicDashboardSource, /email, @user id, or Stellar address/i);
  assert.match(appSource, /WalletRealtimeProvider/);
  assert.doesNotMatch(contactsSource, /new EventSource/);
  assert.doesNotMatch(requestsSource, /new EventSource/);
  assert.match(contactsSource, /useWalletRealtimeEvent/);
  assert.match(requestsSource, /useWalletRealtimeEvent/);
  assert.match(realtimeProviderSource, /new EventSource\("\/api\/wallet\/events"\)/);
  assert.match(realtimeProviderSource, /subscribe/);
});

test("contacts and requests reconcile bootstrap data with fresh server state on entry", () => {
  const contactsSource = readSource("src/components/unified/ContactsTab.tsx");
  const requestsSource = readSource("src/components/unified/RequestsTab.tsx");

  assert.match(contactsSource, /setContacts\(initialContacts\)/);
  assert.match(contactsSource, /void refresh\(\)\.catch\(\(err\) => setError\(String\(err\)\)\)/);
  assert.doesNotMatch(contactsSource, /if \(initialContacts !== undefined\)[\s\S]{0,120}return;/);
  assert.match(requestsSource, /setContacts\(initialContacts\)/);
  assert.match(requestsSource, /void decryptRequestRows\(initialRequests\)/);
  assert.match(requestsSource, /void Promise\.all\(\[refresh\(\), loadNotes\(\)\]\)/);
  assert.doesNotMatch(requestsSource, /if \(initialRequests !== undefined\)[\s\S]{0,220}return;/);
});

test("contacts and requests dither image paths match deployed public assets exactly", () => {
  const contactsSource = readSource("src/components/unified/ContactsTab.tsx");
  const requestsSource = readSource("src/components/unified/RequestsTab.tsx");
  const imagePaths = [...contactsSource.matchAll(/src="(\/images\/[^"]+)"/g)]
    .concat([...requestsSource.matchAll(/src="(\/images\/[^"]+)"/g)])
    .map((match) => match[1]);

  assert.deepEqual(imagePaths.sort(), ["/images/Cash.png", "/images/Hands.png"]);
  for (const imagePath of imagePaths) {
    assert.equal(
      existsSync(join(root, "public", imagePath)),
      true,
      `${imagePath} must exist with exact case for Linux deployment`,
    );
  }
});

test("requests payment flow excludes notes locked by active spend jobs", () => {
  const requestsSource = readSource("src/components/unified/RequestsTab.tsx");

  assert.match(requestsSource, /function isNoteSpendable/);
  assert.match(requestsSource, /!item\.row\.activeJobId/);
  assert.match(requestsSource, /notes\.filter\(isNoteSpendable\)/);
  assert.match(requestsSource, /if \(!isNoteSpendable\(selectedNote\)\)/);
});

test("wallet bootstrap loads the real public account endpoint instead of a missing public route", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");

  assert.doesNotMatch(appSource, /"\/api\/wallet\/public",/);
  assert.match(appSource, /\/api\/wallet\/bootstrap/);
  assert.doesNotMatch(appSource, /BOOTSTRAP_ENDPOINTS/);
  assert.doesNotMatch(appSource, /\/api\/wallet\/contacts",/);
  assert.doesNotMatch(appSource, /\/api\/wallet\/requests",/);
  assert.doesNotMatch(appSource, /\/api\/wallet\/private\/spend-jobs",/);
  assert.doesNotMatch(appSource, /\/api\/wallet\/public\/transactions",/);
});

test("wallet bootstrap feeds the first dashboard render instead of discarding loaded wallet data", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const publicSource = readSource("src/components/unified/PublicDashboard.tsx");
  const privateSource = readSource("src/components/unified/PrivateDashboard.tsx");
  const privateActivitySource = readSource("src/components/unified/PrivateActivity.tsx");
  const publicActivitySource = readSource("src/components/unified/PublicActivity.tsx");
  const contactsSource = readSource("src/components/unified/ContactsTab.tsx");
  const requestsSource = readSource("src/components/unified/RequestsTab.tsx");

  assert.match(appSource, /decryptBootstrapNotes/);
  assert.match(appSource, /initialPublicAccount/);
  assert.match(appSource, /initialPrivateNotes/);
  assert.match(appSource, /initialMarketState/);
  assert.match(appSource, /initialContacts/);
  assert.match(appSource, /initialRequests/);
  assert.match(appSource, /initialSpendJobs/);
  assert.match(appSource, /initialPublicTransactions/);
  assert.match(appSource, /initialNotifications/);
  assert.match(appSource, /initialWalletState=\{bootstrapData\.publicAccount\}/);
  assert.match(appSource, /initialNotes=\{bootstrapData\.privateNotes\}/);
  assert.match(appSource, /initialPublicAccount=\{bootstrapData\.publicAccount\}/);
  assert.match(appSource, /initialContacts=\{bootstrapData\.contacts\}/);
  assert.match(appSource, /initialJobs=\{bootstrapData\.spendJobs\}/);
  assert.match(appSource, /initialTransactions=\{bootstrapData\.publicTransactions\}/);
  assert.match(appSource, /initialRequests=\{bootstrapData\.requests\}/);
  assert.match(appSource, /initialNotifications=\{bootstrapData\.notifications\}/);
  assert.match(publicSource, /initialWalletState\?:/);
  assert.match(publicSource, /initialMarketState\?:/);
  assert.match(publicSource, /initialContacts\?:/);
  assert.match(publicSource, /useState<PublicWalletState \| null>\(initialWalletState \?\? null\)/);
  assert.match(privateSource, /initialNotes\?:/);
  assert.match(privateSource, /initialPublicAccount\?:/);
  assert.match(privateSource, /initialContacts\?:/);
  assert.match(privateSource, /useState<DecryptedNote\[\]>\(initialNotes \?\? \[\]\)/);
  assert.match(privateSource, /initialPublicAccount\?\.usdcUnits \?\? "0"/);
  assert.match(privateActivitySource, /initialJobs\?:/);
  assert.match(publicActivitySource, /initialTransactions\?:/);
  assert.match(contactsSource, /initialContacts\?:/);
  assert.match(requestsSource, /initialRequests\?:/);
  assert.match(requestsSource, /initialContacts\?:/);
});

test("wallet realtime badges are filtered and coalesced instead of refetched for every event", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const privateActivitySource = readSource("src/components/unified/PrivateActivity.tsx");
  const requestsSource = readSource("src/components/unified/RequestsTab.tsx");

  assert.match(appSource, /BADGE_RELEVANT_EVENT_TYPES/);
  assert.match(appSource, /badgeRefreshTimer/);
  assert.match(appSource, /scheduleBadgeRefresh/);
  assert.doesNotMatch(
    appSource,
    /event\.event === "connected" \|\| event\.event === "wallet_activity"/,
  );
  assert.match(appSource, /scheduleBadgeRefresh\(\);/);
  assert.match(privateActivitySource, /jobRefreshTimer/);
  assert.match(privateActivitySource, /scheduleJobsRefresh/);
  assert.doesNotMatch(privateActivitySource, /event\.event === "connected" \|\| eventType\.startsWith\("spend_job_"\)/);
  assert.doesNotMatch(requestsSource, /eventType === "private_note_received" \|\| eventType\.startsWith\("spend_job_"\)/);
  assert.match(requestsSource, /eventType === "private_note_received"/);
});

test("wallet exposes a visible notification inbox instead of write-only backend notifications", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const headerSource = readSource("src/components/unified/TopHeader.tsx");
  const sidebarSource = readSource("src/components/unified/Sidebar.tsx");

  assert.match(appSource, /initialNotifications=\{bootstrapData\.notifications\}/);
  assert.match(appSource, /notificationUnreadCount/);
  assert.match(appSource, /handleNotificationAction/);
  assert.match(appSource, /onNotificationAction=\{handleNotificationAction\}/);
  assert.match(appSource, /url\.origin !== window\.location\.origin/);
  assert.match(appSource, /url\.pathname !== "\/wallet"/);
  assert.doesNotMatch(appSource, /parsedTab === "markets"/);
  assert.doesNotMatch(appSource, /window\.location\.(assign|href|replace)/);
  assert.match(headerSource, /Notifications/);
  assert.match(headerSource, /\/api\/wallet\/notifications/);
  assert.match(headerSource, /markNotificationsRead/);
  assert.match(headerSource, /onNotificationAction/);
  assert.match(headerSource, /event\.preventDefault\(\)/);
  assert.match(headerSource, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(headerSource, /href=\{notification\.actionUrl/);
  assert.match(headerSource, /Bell/);
  assert.match(sidebarSource, /unreadNotifications/);
});

test("wallet notification actions keep navigation in memory so the vault is not remounted", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const headerSource = readSource("src/components/unified/TopHeader.tsx");
  const notificationActionSource = appSource.slice(
    appSource.indexOf("const handleNotificationAction"),
    appSource.indexOf("const refreshBadges"),
  );

  assert.match(appSource, /handleNotificationAction/);
  assert.match(notificationActionSource, /setMode\(parsedMode\)/);
  assert.match(notificationActionSource, /setCurrentTab\(parsedTab\)/);
  assert.doesNotMatch(
    notificationActionSource,
    /window\.history\.(replaceState|pushState)/,
  );
  assert.doesNotMatch(notificationActionSource, /router\.(replace|push)/);
  assert.doesNotMatch(
    notificationActionSource,
    /window\.location\.(assign|href|replace)/,
  );
  assert.match(headerSource, /event\.preventDefault\(\)/);
  assert.match(headerSource, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(headerSource, /href=\{notification\.actionUrl/);
});

test("wallet polish keeps toasts bounded and refreshes dashboard state on first entry", () => {
  const toastSource = readSource("src/components/unified/StatusToast.tsx");
  const publicSource = readSource("src/components/unified/PublicDashboard.tsx");
  const privateSource = readSource("src/components/unified/PrivateDashboard.tsx");

  assert.match(toastSource, /MAX_COLLAPSED_MESSAGE_LENGTH = 50/);
  assert.match(toastSource, /<details/);
  assert.match(toastSource, /break-words/);
  assert.match(toastSource, /max-w-\[min\(420px,calc\(100vw-32px\)\)\]/);
  assert.match(publicSource, /<StatusToast/);
  assert.match(privateSource, /<StatusToast/);
  assert.match(publicSource, /firstRefreshDoneRef/);
  assert.match(privateSource, /firstRefreshDoneRef/);
  assert.match(publicSource, /void refreshAll\(\)/);
  assert.match(privateSource, /void refreshAll\(\)/);
});

test("notification popover dismisses cleanly and refreshes from wallet realtime events", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const headerSource = readSource("src/components/unified/TopHeader.tsx");

  assert.match(appSource, /"private_note_received"/);
  assert.match(appSource, /"private_payment_sent"/);
  assert.match(appSource, /"market_deposit_confirmed"/);
  assert.match(appSource, /"market_bet_confirmed"/);
  assert.match(appSource, /"market_payout_ready"/);
  assert.match(appSource, /"market_payout_claimed"/);
  assert.match(headerSource, /useWalletRealtimeEvent/);
  assert.match(headerSource, /NOTIFICATION_RELEVANT_EVENT_TYPES/);
  assert.match(headerSource, /"market_deposit_confirmed"/);
  assert.match(headerSource, /"market_bet_confirmed"/);
  assert.match(headerSource, /"market_payout_ready"/);
  assert.match(headerSource, /"market_payout_claimed"/);
  assert.match(headerSource, /"market_payout_failed"/);
  assert.match(headerSource, /popoverRef/);
  assert.match(headerSource, /document\.addEventListener\("pointerdown"/);
  assert.match(headerSource, /setNotificationsOpen\(false\)/);
  assert.match(headerSource, /current\.filter\(\(notification\) => !readById\.has\(notification\.id\)\)/);
});

test("wallet navigation controls use explicit buttons so clicks cannot submit and remount the vault", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const headerSource = readSource("src/components/unified/TopHeader.tsx");
  const sidebarSource = readSource("src/components/unified/Sidebar.tsx");

  assert.match(headerSource, /type="button"[\s\S]*?onClick=\{\(\) => onChangeMode\("public"\)\}/);
  assert.match(headerSource, /type="button"[\s\S]*?onClick=\{\(\) => onChangeMode\("private"\)\}/);
  assert.match(sidebarSource, /onClick=\{\(\) => onChangeTab\(tab\.id\)\}[\s\S]*?type="button"/);
  assert.match(appSource, /onClick=\{\(\) => setCurrentTab\(tab\.id as any\)\}[\s\S]*?type="button"/);
});
