import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  acceptContactRequest,
  createPublicTransaction,
  createPaymentRequest,
  createWalletContactRequest,
  createWalletJob,
  deleteEncryptedVault,
  declinePaymentRequest,
  findRegisteredRecipient,
  getEncryptedVault,
  createNotification,
  createNotificationOnce,
  listNotifications,
  listPublicTransactions,
  listWalletContacts,
  listIncomingNotes,
  markNotificationsRead,
  markIncomingNoteClaimed,
  markPaymentRequestPaid,
  markWalletRegisteredInPool,
  recordActivityEvent,
  saveEncryptedVault,
  saveIncomingNote,
  setNoteStatus,
  upsertEncryptedNote,
  upsertWalletProfileForUser,
  updateWalletProfileHandle,
  updateWalletJobProgress,
  type QueryClient,
} from "./walletRepositoryCore";

interface RecordedQuery {
  text: string;
  values: unknown[] | undefined;
}

class RecordingDb implements QueryClient {
  readonly queries: RecordedQuery[] = [];

  async query<Row>(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    return { rows: [{ id: "row-1" } as Row], rowCount: 1 };
  }

  last() {
    const query = this.queries.at(-1);
    assert.ok(query, "expected a query to be recorded");
    return query;
  }
}

test("wallet repository writes every app table through parameterized SQL", async () => {
  const db = new RecordingDb();

  await upsertWalletProfileForUser(db, {
    userId: "user-1",
    email: "User@Example.com ",
    handle: "Veil_User",
  });
  await updateWalletProfileHandle(db, {
    userId: "user-1",
    handle: "Veil_User",
  });
  await saveEncryptedVault(db, {
    userId: "user-1",
    vaultCiphertext: "vault-ciphertext",
    recoveryCiphertext: "recovery-ciphertext",
    kdfName: "argon2id",
    kdfParams: { memory: 65536 },
  });
  await getEncryptedVault(db, { userId: "user-1" });
  await deleteEncryptedVault(db, { userId: "user-1" });
  await markWalletRegisteredInPool(db, {
    userId: "user-1",
    stellarPublicKey: "GABC",
    bn254PublicHex: "bn254-public",
    x25519PublicHex: "x25519-public",
    membershipBlindingPublicHex: "member-leaf",
    txHash: "tx-register",
  });
  await upsertEncryptedNote(db, {
    userId: "user-1",
    commitmentHex: "commitment",
    encryptedNoteCiphertext: "note-ciphertext",
    amountUnits: "2000000000",
    status: "unspent",
    source: "deposit",
    leafIndex: 42,
  });
  await setNoteStatus(db, {
    userId: "user-1",
    commitmentHex: "commitment",
    status: "spent",
    txHash: "tx-spend",
  });
  await createWalletJob(db, {
    userId: "user-1",
    kind: "lane1_send",
    status: "queued",
    idempotencyKey: "idem-1",
    inputCiphertext: "job-input-ciphertext",
    progress: { phase: "queued" },
  });
  await updateWalletJobProgress(db, {
    jobId: "job-1",
    status: "mined",
    progress: { txHash: "tx-job" },
    txHash: "tx-job",
  });
  await createPaymentRequest(db, {
    requesterUserId: "user-2",
    payerUserId: "user-1",
    amountUnits: "2000000000",
    memoCiphertext: "memo-ciphertext",
  });
  await createWalletContactRequest(db, {
    requesterUserId: "user-1",
    contactUserId: "user-2",
  });
  await listWalletContacts(db, { userId: "user-1" });
  await acceptContactRequest(db, {
    userId: "user-2",
    contactId: "contact-1",
  });
  await markPaymentRequestPaid(db, {
    requestId: "request-1",
    payerUserId: "user-1",
    spendJobId: "spend-job-1",
  });
  await recordActivityEvent(db, {
    userId: "user-1",
    eventType: "proof",
    eventData: { ok: true },
    txHash: "tx-activity",
  });
  await createNotification(db, {
    userId: "user-1",
    activityEventId: "activity-1",
    type: "spend_job_submitted",
    severity: "info",
    entityKind: "spend_job",
    entityId: "job-1",
    title: "Payment submitted",
    body: "Your private payment was submitted.",
    actionUrl: "/wallet?tab=activity",
  });
  await createNotificationOnce(db, {
    userId: "user-1",
    activityEventId: "activity-1",
    type: "spend_job_submitted",
    severity: "info",
    entityKind: "spend_job",
    entityId: "job-1",
    title: "Payment submitted",
    body: "Your private payment was submitted.",
    actionUrl: "/wallet?tab=activity",
  });
  await listNotifications(db, { userId: "user-1", unreadOnly: true });
  await markNotificationsRead(db, {
    userId: "user-1",
    notificationIds: ["notification-1"],
  });
  await createPublicTransaction(db, {
    userId: "user-1",
    sourcePublicKey: "GSOURCE",
    destinationPublicKey: "GDESTINATION",
    kind: "payment",
    assetCode: "USDC",
    amountUnits: "10000000",
    txHash: "tx-public",
    ledger: 123,
  });
  await listPublicTransactions(db, { userId: "user-1" });
  await saveIncomingNote(db, {
    recipientUserId: "user-2",
    senderUserId: "user-1",
    spendJobId: "job-1",
    spendJobStepId: "step-1",
    commitmentHex: "recipient-commitment",
    amountUnits: "2000000000",
    encryptedOutput: "encrypted-output",
    txHash: "tx-lane2",
    leafIndex: 77,
  });
  await listIncomingNotes(db, { userId: "user-2", status: "pending" });
  await markIncomingNoteClaimed(db, {
    userId: "user-2",
    incomingNoteId: "incoming-1",
    commitmentHex: "recipient-commitment",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  for (const table of [
    "wallet_profiles",
    "vaults",
    "notes",
    "jobs",
    "contacts",
    "requests",
    "activity_events",
    "notification_inbox",
    "public_transactions",
    "incoming_notes",
  ]) {
    assert.match(combinedSql, new RegExp(`\\b${table}\\b`, "i"));
  }
  for (const query of db.queries) {
    assert.match(query.text, /\$\d/);
    assert.ok(query.values && query.values.length > 0);
  }
});

test("createNotificationOnce dedupes retry notifications by user type and entity", async () => {
  const db = new RecordingDb();

  await createNotificationOnce(db, {
    userId: "user-1",
    activityEventId: "activity-1",
    type: "private_payment_sent",
    severity: "success",
    entityKind: "spend_job",
    entityId: "job-1",
    title: "Private payment sent",
    body: "All private payment steps are complete.",
    actionUrl: "/wallet?mode=private&tab=activity",
  });

  const query = db.last();
  assert.match(query.text, /insert into notification_inbox/i);
  assert.match(query.text, /where not exists/i);
  assert.match(query.text, /user_id = \$1::uuid/i);
  assert.match(query.text, /type = \$3/i);
  assert.match(query.text, /entity_kind = \$5/i);
  assert.match(query.text, /entity_id is not distinct from \$6::uuid/i);
});

test("wallet repository normalizes emails and only exposes encrypted secret material columns", async () => {
  const db = new RecordingDb();
  await upsertWalletProfileForUser(db, {
    userId: "user-1",
    email: "User@Example.com ",
    handle: "Veil_User ",
  });
  assert.deepEqual(db.last().values, ["user-1", "user@example.com", "Veil_User", "veil_user"]);

  await updateWalletProfileHandle(db, {
    userId: "user-1",
    handle: "@Fresh_User",
  });
  assert.deepEqual(db.last().values, ["user-1", "Fresh_User", "fresh_user"]);

  await createPaymentRequest(db, {
    requesterUserId: "user-2",
    payerUserId: "user-1",
    payerEmail: "Payer@Example.com ",
    amountUnits: "100000000",
  });
  assert.equal(db.last().values?.[2], "payer@example.com");

  const source = readFileSync(
    join(process.cwd(), "src", "lib", "server", "walletRepositoryCore.ts"),
    "utf8",
  );
  assert.match(source, /vault_ciphertext/);
  assert.match(source, /recovery_ciphertext/);
  assert.match(source, /encrypted_note_ciphertext/);
  assert.doesNotMatch(source, /\bstellar_secret\b/i);
  assert.doesNotMatch(source, /\bbn254_secret\b/i);
  assert.doesNotMatch(source, /\bx25519_secret\b/i);
  assert.doesNotMatch(source, /\bnote_secret\b/i);
  assert.doesNotMatch(source, /\bseed_phrase\b/i);
  assert.doesNotMatch(source, /\brecipient_seed\b/i);
});

test("wallet repository creates one normalized mutual contact pair", async () => {
  const db = new RecordingDb();

  await createWalletContactRequest(db, {
    requesterUserId: "user-b",
    contactUserId: "user-a",
  });

  const query = db.last();
  assert.match(query.text, /insert into contacts/i);
  assert.match(query.text, /least\(\$1::uuid, \$2::uuid\)/i);
  assert.match(query.text, /greatest\(\$1::uuid, \$2::uuid\)/i);
  assert.match(query.text, /on conflict \(user_low_id, user_high_id\)/i);
  assert.deepEqual(query.values, ["user-b", "user-a"]);
});

test("wallet repository payment requests link to accepted contacts and spend jobs", async () => {
  const db = new RecordingDb();

  await createPaymentRequest(db, {
    requesterUserId: "user-b",
    payerUserId: "user-a",
    amountUnits: "200000000",
    memoCiphertext: "encrypted-request-memo",
  });

  assert.match(db.last().text, /exists \(\s*select 1\s+from contacts/i);
  assert.match(db.last().text, /status = 'accepted'/i);
  assert.equal(db.last().values?.[0], "user-b");
  assert.equal(db.last().values?.[1], "user-a");
  assert.equal(db.last().values?.[5], "encrypted-request-memo");

  await declinePaymentRequest(db, {
    requestId: "request-1",
    payerUserId: "user-a",
  });

  assert.match(db.last().text, /update requests set/i);
  assert.match(db.last().text, /status = 'declined'/i);
  assert.doesNotMatch(db.last().text, /spend_jobs/i);
  assert.doesNotMatch(db.last().text, /\$3/);
  assert.deepEqual(db.last().values, ["request-1", "user-a"]);

  await markPaymentRequestPaid(db, {
    requestId: "request-1",
    payerUserId: "user-a",
    spendJobId: "spend-job-1",
  });

  assert.match(db.last().text, /update requests set/i);
  assert.match(db.last().text, /paid_spend_job_id = \$3::uuid/i);
  assert.match(db.last().text, /exists \(\s*select 1\s+from spend_jobs/i);
  assert.match(db.last().text, /request_id = requests\.id/i);
  assert.match(db.last().text, /status = 'completed'/i);
  assert.match(db.last().text, /status = 'open'/i);
  assert.deepEqual(db.last().values, ["request-1", "user-a", "spend-job-1"]);
});

test("wallet repository resolves registered recipients by email, handle, or stellar address", async () => {
  const db = new RecordingDb();

  await findRegisteredRecipient(db, { query: "User@Example.com" });
  assert.match(db.last().text, /lower\(email\) = \$1/i);
  assert.deepEqual(db.last().values, ["user@example.com"]);

  await findRegisteredRecipient(db, { query: "@Veil_User" });
  assert.match(db.last().text, /handle_normalized = \$1/i);
  assert.deepEqual(db.last().values, ["veil_user"]);

  await findRegisteredRecipient(db, {
    query: "GAT4VWR53RQEYILFJVKUZVJFYGEPRANKIFUSHZYWE3IG6RQF7INNKCKC",
  });
  assert.match(db.last().text, /stellar_public_key = \$1/i);
  assert.deepEqual(db.last().values, [
    "GAT4VWR53RQEYILFJVKUZVJFYGEPRANKIFUSHZYWE3IG6RQF7INNKCKC",
  ]);
});

test("wallet repository claims incoming notes only after the encrypted note exists", async () => {
  const db = new RecordingDb();

  await markIncomingNoteClaimed(db, {
    userId: "user-2",
    incomingNoteId: "incoming-1",
    commitmentHex: "recipient-commitment",
  });

  const query = db.last();
  assert.match(query.text, /update incoming_notes/i);
  assert.match(query.text, /claimed_note_id = \(select id from notes/i);
  assert.match(query.text, /recipient_user_id = \$1/i);
  assert.match(query.text, /commitment_hex = \$3/i);
  assert.deepEqual(query.values, ["user-2", "incoming-1", "recipient-commitment"]);
});
