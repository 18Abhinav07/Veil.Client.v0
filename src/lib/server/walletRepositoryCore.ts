import { randomUUID } from "node:crypto";

export interface QueryResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

export interface QueryClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface WalletProfileRow {
  id: string;
  user_id: string;
  email: string;
  handle: string | null;
  handle_normalized: string | null;
  stellar_public_key: string | null;
  bn254_public_hex: string | null;
  x25519_public_hex: string | null;
  membership_blinding_public_hex: string | null;
  registered_in_pool: boolean;
  pool_registration_tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface VaultRow {
  id: string;
  user_id: string;
  vault_version: number;
  vault_ciphertext: string;
  recovery_ciphertext: string;
  kdf_name: string;
  kdf_params: Record<string, unknown>;
  encryption_alg: string;
  created_at: Date;
  updated_at: Date;
}

export interface NoteRow {
  id: string;
  user_id: string;
  commitment_hex: string;
  encrypted_note_ciphertext: string;
  asset_code: string;
  amount_units: string;
  leaf_index: number | null;
  status: NoteStatus;
  source: NoteSource;
  tx_hash: string | null;
  active_job_id?: string | null;
  spend_version?: number;
  last_chain_checked_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface JobRow {
  id: string;
  user_id: string | null;
  kind: string;
  status: JobStatus;
  idempotency_key: string | null;
  input_ciphertext: string | null;
  progress: Record<string, unknown>;
  error: string | null;
  tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRequestRow {
  id: string;
  requester_user_id: string;
  payer_user_id: string | null;
  payer_email: string | null;
  amount_units: string;
  asset_code: string;
  memo_ciphertext: string | null;
  status: RequestStatus;
  paid_job_id: string | null;
  paid_spend_job_id: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRequestViewRow extends PaymentRequestRow {
  requester_email: string | null;
  requester_handle: string | null;
  requester_stellar_public_key: string | null;
  requester_bn254_public_hex: string | null;
  requester_x25519_public_hex: string | null;
  payer_handle: string | null;
  direction: "inbox" | "sent";
}

export interface ContactRow {
  id: string;
  requester_user_id: string;
  contact_user_id: string;
  user_low_id: string;
  user_high_id: string;
  status: ContactStatus;
  created_at: Date;
  updated_at: Date;
  responded_at: Date | null;
}

export interface ContactViewRow extends ContactRow {
  other_user_id: string;
  other_email: string | null;
  other_handle: string | null;
  other_stellar_public_key: string | null;
  other_registered_in_pool: boolean | null;
  other_bn254_public_hex: string | null;
  other_x25519_public_hex: string | null;
  direction: "incoming" | "outgoing" | "mutual";
}

export interface ActivityEventRow {
  id: string;
  user_id: string;
  job_id: string | null;
  spend_job_id: string | null;
  note_id: string | null;
  request_id: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  tx_hash: string | null;
  created_at: Date;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  activity_event_id: string | null;
  type: string;
  severity: "info" | "success" | "warning" | "error";
  entity_kind: string;
  entity_id: string | null;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: Date | null;
  seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface WalletBadgeCounts {
  incomingContactRequests: number;
  openPaymentRequests: number;
  unreadNotifications: number;
  recoverableJobs: number;
}

export interface PublicTransactionRow {
  id: string;
  user_id: string;
  source_public_key: string;
  destination_public_key: string | null;
  kind: "payment" | "trustline" | "swap" | "funding";
  asset_code: string | null;
  amount_units: string | null;
  tx_hash: string;
  ledger: number | null;
  status: "pending" | "submitted" | "confirmed" | "failed";
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SpendJobRow {
  id: string;
  user_id: string;
  request_id: string | null;
  kind: string;
  status: SpendJobStatus;
  idempotency_key: string;
  source_note_id: string | null;
  source_commitment_hex: string;
  source_amount_units: string;
  source_leaf_index: number | null;
  active_note_id: string | null;
  active_commitment_hex: string;
  active_amount_units: string;
  active_leaf_index: number | null;
  pool_id: string;
  total_amount_units: string;
  total_recipients: number;
  completed_count: number;
  retry_after: Date | null;
  error_class: string | null;
  error_message: string | null;
  lease_token: string | null;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  last_heartbeat_at: Date | null;
  reconcile_after: Date | null;
  execution_mode: "interactive" | "background";
  execution_package_ciphertext: string | null;
  execution_package_expires_at: Date | null;
  execution_package_deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SpendJobStepRow {
  id: string;
  job_id: string;
  user_id: string;
  ordinal: number;
  recipient_address: string;
  amount_units: string;
  status: SpendJobStepStatus;
  source_note_id: string | null;
  source_commitment_hex: string;
  source_amount_units: string;
  source_leaf_index: number | null;
  input_nullifier_hex: string | null;
  relay_body: Record<string, unknown> | null;
  tx_hash: string | null;
  output_commitment_hex: string | null;
  output_amount_units: string | null;
  output_leaf_index: number | null;
  encrypted_change_note_ciphertext: string | null;
  recipient_user_id: string | null;
  recipient_handle: string | null;
  recipient_note_public_hex: string | null;
  recipient_x25519_public_hex: string | null;
  recipient_output_commitment_hex: string | null;
  recipient_output_leaf_index: number | null;
  recipient_encrypted_output: string | null;
  attempts: number;
  error_class: string | null;
  error_message: string | null;
  retry_after: Date | null;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  last_heartbeat_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SpendJobDetail {
  job: SpendJobRow;
  steps: SpendJobStepRow[];
}

export interface IncomingNoteRow {
  id: string;
  recipient_user_id: string;
  sender_user_id: string | null;
  spend_job_id: string | null;
  spend_job_step_id: string | null;
  commitment_hex: string;
  amount_units: string;
  encrypted_output: string;
  tx_hash: string | null;
  leaf_index: number | null;
  status: "pending" | "claimed" | "failed";
  claimed_note_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export type NoteStatus =
  | "unspent"
  | "spent"
  | "pending_deposit"
  | "pending_spend"
  | "received"
  | "failed_recovery";

export type NoteSource = "deposit" | "change" | "received";

export type SpendJobStatus =
  | "queued"
  | "running"
  | "paused_needs_unlock"
  | "waiting_retry"
  | "needs_reconcile"
  | "completed"
  | "failed_recoverable"
  | "failed_final"
  | "canceled";

export type SpendJobStepStatus =
  | "queued"
  | "proving"
  | "proof_ready"
  | "relaying"
  | "submitted"
  | "mined"
  | "indexing"
  | "stored"
  | "confirmed"
  | "retry_wait"
  | "needs_reconcile"
  | "failed_final";

const MAX_SPEND_JOB_STEP_ATTEMPTS = 3;

export type JobStatus =
  | "queued"
  | "proving"
  | "relaying"
  | "mined"
  | "indexed"
  | "stored"
  | "failed";

export type RequestStatus = "open" | "paid" | "declined" | "expired" | "failed_recoverable";
export type ContactStatus = "pending" | "accepted" | "declined" | "removed";

function one<Row>(result: QueryResult<Row>): Row | null {
  return result.rows[0] ?? null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

function isLikelyStellarPublicKey(query: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(query.trim());
}

function assertMutation(result: QueryResult<unknown>, message: string): void {
  if ((result.rowCount ?? 0) <= 0) {
    throw new Error(message);
  }
}

interface ReleasableQueryClient extends QueryClient {
  release?: () => void;
}

interface PoolLikeQueryClient extends QueryClient {
  connect?: () => Promise<ReleasableQueryClient>;
}

async function withTransaction<T>(
  db: QueryClient,
  fn: (client: QueryClient) => Promise<T>,
): Promise<T> {
  const pool = db as PoolLikeQueryClient;
  const client = pool.connect ? await pool.connect() : db;
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    (client as ReleasableQueryClient).release?.();
  }
}

export async function upsertWalletProfileForUser(
  db: QueryClient,
  input: { userId: string; email: string; handle?: string | null },
): Promise<WalletProfileRow | null> {
  const handle = input.handle?.trim() || null;
  const handleNormalized = handle ? normalizeHandle(handle) : null;
  const result = await db.query<WalletProfileRow>(
    `insert into wallet_profiles (user_id, email, handle, handle_normalized)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update set
       email = excluded.email,
       handle = coalesce(excluded.handle, wallet_profiles.handle),
       handle_normalized = coalesce(excluded.handle_normalized, wallet_profiles.handle_normalized),
       updated_at = now()
     returning *`,
    [input.userId, normalizeEmail(input.email), handle, handleNormalized],
  );
  return one(result);
}

export async function updateWalletProfileHandle(
  db: QueryClient,
  input: { userId: string; handle: string },
): Promise<WalletProfileRow | null> {
  const handle = input.handle.trim().replace(/^@/, "");
  const handleNormalized = normalizeHandle(handle);
  const result = await db.query<WalletProfileRow>(
    `update wallet_profiles set
       handle = $2,
       handle_normalized = $3,
       updated_at = now()
     where user_id = $1
     returning *`,
    [input.userId, handle, handleNormalized],
  );
  return one(result);
}

export async function findRegisteredRecipient(
  db: QueryClient,
  input: { query: string },
): Promise<WalletProfileRow | null> {
  const raw = input.query.trim();
  if (!raw) return null;

  let where: string;
  let value: string;
  if (isLikelyStellarPublicKey(raw)) {
    where = "stellar_public_key = $1";
    value = raw;
  } else if (raw.includes("@") && !raw.startsWith("@")) {
    where = "lower(email) = $1";
    value = normalizeEmail(raw);
  } else {
    where = "handle_normalized = $1";
    value = normalizeHandle(raw);
  }

  const result = await db.query<WalletProfileRow>(
    `select *
     from wallet_profiles
     where ${where}
       and registered_in_pool = true
       and bn254_public_hex is not null
       and x25519_public_hex is not null
     limit 1`,
    [value],
  );
  return one(result);
}

function recipientWhereForQuery(raw: string): { where: string; value: string } | null {
  const value = raw.trim();
  if (!value) return null;
  if (isLikelyStellarPublicKey(value)) {
    return { where: "stellar_public_key = $1", value };
  }
  if (value.includes("@") && !value.startsWith("@")) {
    return { where: "lower(email) = $1", value: normalizeEmail(value) };
  }
  return { where: "handle_normalized = $1", value: normalizeHandle(value) };
}

export async function findWalletProfileForContact(
  db: QueryClient,
  input: { query: string },
): Promise<WalletProfileRow | null> {
  const resolved = recipientWhereForQuery(input.query);
  if (!resolved) return null;
  const result = await db.query<WalletProfileRow>(
    `select *
     from wallet_profiles
     where ${resolved.where}
     limit 1`,
    [resolved.value],
  );
  return one(result);
}

export async function findAcceptedContactProfile(
  db: QueryClient,
  input: { userId: string; query: string },
): Promise<WalletProfileRow | null> {
  const resolved = recipientWhereForQuery(input.query);
  if (!resolved) return null;
  const result = await db.query<WalletProfileRow>(
    `select p.*
     from wallet_profiles p
     where ${resolved.where.replace("$1", "$2")}
       and exists (
         select 1
         from contacts c
         where c.status = 'accepted'
           and c.user_low_id = least($1::uuid, p.user_id)
           and c.user_high_id = greatest($1::uuid, p.user_id)
       )
     limit 1`,
    [input.userId, resolved.value],
  );
  return one(result);
}

export async function getWalletProfileByUserId(
  db: QueryClient,
  input: { userId: string },
): Promise<WalletProfileRow | null> {
  const result = await db.query<WalletProfileRow>(
    `select *
     from wallet_profiles
     where user_id = $1
     limit 1`,
    [input.userId],
  );
  return one(result);
}

export async function saveEncryptedVault(
  db: QueryClient,
  input: {
    userId: string;
    vaultCiphertext: string;
    recoveryCiphertext: string;
    kdfName: string;
    kdfParams: Record<string, unknown>;
    encryptionAlg?: string;
  },
): Promise<VaultRow | null> {
  const result = await db.query<VaultRow>(
    `insert into vaults (
       user_id,
       vault_ciphertext,
       recovery_ciphertext,
       kdf_name,
       kdf_params,
       encryption_alg
     )
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id) do update set
       vault_ciphertext = excluded.vault_ciphertext,
       recovery_ciphertext = excluded.recovery_ciphertext,
       kdf_name = excluded.kdf_name,
       kdf_params = excluded.kdf_params,
       encryption_alg = excluded.encryption_alg,
       updated_at = now()
     returning *`,
    [
      input.userId,
      input.vaultCiphertext,
      input.recoveryCiphertext,
      input.kdfName,
      input.kdfParams,
      input.encryptionAlg ?? "AES-256-GCM",
    ],
  );
  return one(result);
}

export async function getEncryptedVault(
  db: QueryClient,
  input: { userId: string },
): Promise<VaultRow | null> {
  const result = await db.query<VaultRow>(
    `select *
     from vaults
     where user_id = $1
     limit 1`,
    [input.userId],
  );
  return one(result);
}

export async function deleteEncryptedVault(
  db: QueryClient,
  input: { userId: string },
): Promise<number> {
  const result = await db.query(
    `delete from vaults
     where user_id = $1`,
    [input.userId],
  );
  return result.rowCount ?? 0;
}

export async function markWalletRegisteredInPool(
  db: QueryClient,
  input: {
    userId: string;
    stellarPublicKey: string;
    bn254PublicHex: string;
    x25519PublicHex: string;
    membershipBlindingPublicHex?: string | null;
    txHash: string;
  },
): Promise<WalletProfileRow | null> {
  const result = await db.query<WalletProfileRow>(
    `update wallet_profiles set
       stellar_public_key = $2,
       bn254_public_hex = $3,
       x25519_public_hex = $4,
       membership_blinding_public_hex = $6,
       registered_in_pool = true,
       pool_registration_tx_hash = $5,
       updated_at = now()
     where user_id = $1
     returning *`,
    [
      input.userId,
      input.stellarPublicKey,
      input.bn254PublicHex,
      input.x25519PublicHex,
      input.txHash,
      input.membershipBlindingPublicHex ?? null,
    ],
  );
  return one(result);
}

export async function createWalletContactRequest(
  db: QueryClient,
  input: { requesterUserId: string; contactUserId: string },
): Promise<ContactRow | null> {
  if (input.requesterUserId === input.contactUserId) {
    throw new Error("Cannot add your own wallet as a contact");
  }
  const result = await db.query<ContactRow>(
    `insert into contacts (
       requester_user_id,
       contact_user_id,
       user_low_id,
       user_high_id,
       status
     )
     values ($1::uuid, $2::uuid, least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), 'pending')
     on conflict (user_low_id, user_high_id) do update set
       requester_user_id = case
         when contacts.status in ('declined', 'removed') then excluded.requester_user_id
         else contacts.requester_user_id
       end,
       contact_user_id = case
         when contacts.status in ('declined', 'removed') then excluded.contact_user_id
         else contacts.contact_user_id
       end,
       status = case
         when contacts.status = 'accepted' then 'accepted'
         else 'pending'
       end,
       responded_at = case
         when contacts.status = 'accepted' then contacts.responded_at
         else null
       end,
       updated_at = now()
     returning *`,
    [input.requesterUserId, input.contactUserId],
  );
  return one(result);
}

export async function listWalletContacts(
  db: QueryClient,
  input: { userId: string },
): Promise<ContactViewRow[]> {
  const result = await db.query<ContactViewRow>(
    `select
       c.*,
       other_profile.user_id as other_user_id,
       other_profile.email as other_email,
       other_profile.handle as other_handle,
       other_profile.stellar_public_key as other_stellar_public_key,
       other_profile.registered_in_pool as other_registered_in_pool,
       other_profile.bn254_public_hex as other_bn254_public_hex,
       other_profile.x25519_public_hex as other_x25519_public_hex,
       case
         when c.status = 'accepted' then 'mutual'
         when c.requester_user_id = $1 then 'outgoing'
         else 'incoming'
       end as direction
     from contacts c
     join wallet_profiles other_profile
       on other_profile.user_id = case
         when c.requester_user_id = $1 then c.contact_user_id
         else c.requester_user_id
       end
     where $1::uuid in (c.requester_user_id, c.contact_user_id)
       and c.status in ('pending', 'accepted', 'declined')
     order by c.updated_at desc`,
    [input.userId],
  );
  return result.rows;
}

export async function acceptContactRequest(
  db: QueryClient,
  input: { userId: string; contactId: string },
): Promise<ContactRow | null> {
  const result = await db.query<ContactRow>(
    `update contacts set
       status = 'accepted',
       responded_at = now(),
       updated_at = now()
     where id = $2::uuid
       and contact_user_id = $1::uuid
       and status = 'pending'
     returning *`,
    [input.userId, input.contactId],
  );
  return one(result);
}

export async function declineContactRequest(
  db: QueryClient,
  input: { userId: string; contactId: string },
): Promise<ContactRow | null> {
  const result = await db.query<ContactRow>(
    `update contacts set
       status = 'declined',
       responded_at = now(),
       updated_at = now()
     where id = $2::uuid
       and contact_user_id = $1::uuid
       and status = 'pending'
     returning *`,
    [input.userId, input.contactId],
  );
  return one(result);
}

export async function removeWalletContact(
  db: QueryClient,
  input: { userId: string; contactId: string },
): Promise<ContactRow | null> {
  const result = await db.query<ContactRow>(
    `update contacts set
       status = 'removed',
       updated_at = now()
     where id = $2::uuid
       and $1::uuid in (requester_user_id, contact_user_id)
       and status in ('pending', 'accepted')
     returning *`,
    [input.userId, input.contactId],
  );
  return one(result);
}

export async function upsertEncryptedNote(
  db: QueryClient,
  input: {
    userId: string;
    commitmentHex: string;
    encryptedNoteCiphertext: string;
    amountUnits: string;
    status: NoteStatus;
    source: NoteSource;
    assetCode?: string;
    leafIndex?: number | null;
    txHash?: string | null;
  },
): Promise<NoteRow | null> {
  const result = await db.query<NoteRow>(
    `insert into notes (
       user_id,
       commitment_hex,
       encrypted_note_ciphertext,
       asset_code,
       amount_units,
       leaf_index,
       status,
       source,
       tx_hash
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (user_id, commitment_hex) do update set
       encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
       asset_code = excluded.asset_code,
       amount_units = excluded.amount_units,
       leaf_index = coalesce(excluded.leaf_index, notes.leaf_index),
       status = excluded.status,
       source = excluded.source,
       tx_hash = coalesce(excluded.tx_hash, notes.tx_hash),
       updated_at = now()
     returning *`,
    [
      input.userId,
      input.commitmentHex,
      input.encryptedNoteCiphertext,
      input.assetCode ?? "USDC",
      input.amountUnits,
      input.leafIndex ?? null,
      input.status,
      input.source,
      input.txHash ?? null,
    ],
  );
  return one(result);
}

export async function saveIncomingNote(
  db: QueryClient,
  input: {
    recipientUserId: string;
    senderUserId?: string | null;
    spendJobId?: string | null;
    spendJobStepId?: string | null;
    commitmentHex: string;
    amountUnits: string;
    encryptedOutput: string;
    txHash?: string | null;
    leafIndex?: number | null;
  },
): Promise<IncomingNoteRow | null> {
  const result = await db.query<IncomingNoteRow>(
    `insert into incoming_notes (
       recipient_user_id,
       sender_user_id,
       spend_job_id,
       spend_job_step_id,
       commitment_hex,
       amount_units,
       encrypted_output,
       tx_hash,
       leaf_index,
       status
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     on conflict (recipient_user_id, commitment_hex) do update set
       sender_user_id = coalesce(excluded.sender_user_id, incoming_notes.sender_user_id),
       spend_job_id = coalesce(excluded.spend_job_id, incoming_notes.spend_job_id),
       spend_job_step_id = coalesce(excluded.spend_job_step_id, incoming_notes.spend_job_step_id),
       amount_units = excluded.amount_units,
       encrypted_output = excluded.encrypted_output,
       tx_hash = coalesce(excluded.tx_hash, incoming_notes.tx_hash),
       leaf_index = coalesce(excluded.leaf_index, incoming_notes.leaf_index),
       status = case
         when incoming_notes.status = 'claimed' then incoming_notes.status
         else 'pending'
       end,
       updated_at = now()
     returning *`,
    [
      input.recipientUserId,
      input.senderUserId ?? null,
      input.spendJobId ?? null,
      input.spendJobStepId ?? null,
      input.commitmentHex,
      input.amountUnits,
      input.encryptedOutput,
      input.txHash ?? null,
      input.leafIndex ?? null,
    ],
  );
  return one(result);
}

export async function listIncomingNotes(
  db: QueryClient,
  input: { userId: string; status?: "pending" | "claimed" | "failed" },
): Promise<IncomingNoteRow[]> {
  const result = await db.query<IncomingNoteRow>(
    `select *
     from incoming_notes
     where recipient_user_id = $1
       and ($2::text is null or status = $2)
     order by created_at desc`,
    [input.userId, input.status ?? null],
  );
  return result.rows;
}

export async function markIncomingNoteClaimed(
  db: QueryClient,
  input: { userId: string; incomingNoteId: string; commitmentHex: string },
): Promise<IncomingNoteRow | null> {
  const result = await db.query<IncomingNoteRow>(
    `update incoming_notes set
       status = 'claimed',
       claimed_note_id = (select id from notes where user_id = $1 and commitment_hex = $3 limit 1),
       error_message = null,
       updated_at = now()
     where recipient_user_id = $1
       and id = $2::uuid
       and commitment_hex = $3
       and exists (
         select 1
         from notes
         where user_id = $1
           and commitment_hex = $3
           and source = 'received'
       )
     returning *`,
    [input.userId, input.incomingNoteId, input.commitmentHex],
  );
  return one(result);
}

export async function getEncryptedNotesForUser(
  db: QueryClient,
  input: { userId: string },
): Promise<NoteRow[]> {
  const result = await db.query<NoteRow>(
    `select *
     from notes
     where user_id = $1
     order by created_at desc`,
    [input.userId],
  );
  return result.rows;
}

export async function setNoteStatus(
  db: QueryClient,
  input: {
    userId: string;
    commitmentHex: string;
    status: NoteStatus;
    txHash?: string | null;
  },
): Promise<NoteRow | null> {
  const result = await db.query<NoteRow>(
    `update notes set
       status = $3,
       tx_hash = coalesce($4, tx_hash),
       updated_at = now()
     where user_id = $1 and commitment_hex = $2
     returning *`,
    [input.userId, input.commitmentHex, input.status, input.txHash ?? null],
  );
  return one(result);
}

export async function createWalletJob(
  db: QueryClient,
  input: {
    userId?: string | null;
    kind: string;
    status: JobStatus;
    idempotencyKey?: string | null;
    inputCiphertext?: string | null;
    progress?: Record<string, unknown>;
  },
): Promise<JobRow | null> {
  const result = await db.query<JobRow>(
    `insert into jobs (
       user_id,
       kind,
       status,
       idempotency_key,
       input_ciphertext,
       progress
     )
     values ($1, $2, $3, $4, $5, $6)
     on conflict (idempotency_key) do update set
       progress = jobs.progress || excluded.progress,
       updated_at = now()
     returning *`,
    [
      input.userId ?? null,
      input.kind,
      input.status,
      input.idempotencyKey ?? null,
      input.inputCiphertext ?? null,
      input.progress ?? {},
    ],
  );
  return one(result);
}

export async function updateWalletJobProgress(
  db: QueryClient,
  input: {
    jobId: string;
    status: JobStatus;
    progress?: Record<string, unknown>;
    txHash?: string | null;
    error?: string | null;
  },
): Promise<JobRow | null> {
  const result = await db.query<JobRow>(
    `update jobs set
       status = $2,
       progress = progress || $3,
       tx_hash = coalesce($4, tx_hash),
       error = $5,
       updated_at = now()
     where id = $1
     returning *`,
    [
      input.jobId,
      input.status,
      input.progress ?? {},
      input.txHash ?? null,
      input.error ?? null,
    ],
  );
  return one(result);
}

export async function createPaymentRequest(
  db: QueryClient,
  input: {
    requesterUserId: string;
    payerUserId: string;
    payerEmail?: string | null;
    amountUnits: string;
    assetCode?: string;
    memoCiphertext?: string | null;
    expiresAt?: Date | null;
  },
): Promise<PaymentRequestRow | null> {
  const result = await db.query<PaymentRequestRow>(
    `insert into requests (
       requester_user_id,
       payer_user_id,
       payer_email,
       amount_units,
       asset_code,
       memo_ciphertext,
       status,
       expires_at
     )
     select $1::uuid, $2::uuid, $3, $4, $5, $6, 'open', $7
     where exists (
       select 1
       from contacts c
       where c.status = 'accepted'
         and c.user_low_id = least($1::uuid, $2::uuid)
         and c.user_high_id = greatest($1::uuid, $2::uuid)
     )
     returning *`,
    [
      input.requesterUserId,
      input.payerUserId,
      input.payerEmail ? normalizeEmail(input.payerEmail) : null,
      input.amountUnits,
      input.assetCode ?? "USDC",
      input.memoCiphertext ?? null,
      input.expiresAt ?? null,
    ],
  );
  return one(result);
}

export async function listPaymentRequests(
  db: QueryClient,
  input: { userId: string; limit?: number },
): Promise<PaymentRequestViewRow[]> {
  const result = await db.query<PaymentRequestViewRow>(
    `select
       r.*,
       requester.email as requester_email,
       requester.handle as requester_handle,
       requester.stellar_public_key as requester_stellar_public_key,
       requester.bn254_public_hex as requester_bn254_public_hex,
       requester.x25519_public_hex as requester_x25519_public_hex,
       payer.handle as payer_handle,
       case when r.payer_user_id = $1 then 'inbox' else 'sent' end as direction
     from requests r
     join wallet_profiles requester on requester.user_id = r.requester_user_id
     left join wallet_profiles payer on payer.user_id = r.payer_user_id
     where r.requester_user_id = $1 or r.payer_user_id = $1
     order by r.created_at desc
     limit $2`,
    [input.userId, input.limit ?? 50],
  );
  return result.rows;
}

export async function declinePaymentRequest(
  db: QueryClient,
  input: { requestId: string; payerUserId: string },
): Promise<PaymentRequestRow | null> {
  const result = await db.query<PaymentRequestRow>(
    `update requests set
       status = 'declined',
       updated_at = now()
     where id = $1::uuid
       and payer_user_id = $2::uuid
       and status = 'open'
     returning *`,
    [input.requestId, input.payerUserId],
  );
  return one(result);
}

export async function expirePaymentRequest(
  db: QueryClient,
  input: { requestId: string; userId: string },
): Promise<PaymentRequestRow | null> {
  const result = await db.query<PaymentRequestRow>(
    `update requests set
       status = 'expired',
       updated_at = now()
     where id = $1::uuid
       and (requester_user_id = $2::uuid or payer_user_id = $2::uuid)
       and status = 'open'
     returning *`,
    [input.requestId, input.userId],
  );
  return one(result);
}

export async function markPaymentRequestPaid(
  db: QueryClient,
  input: { requestId: string; payerUserId: string; spendJobId: string },
): Promise<PaymentRequestRow | null> {
  const result = await db.query<PaymentRequestRow>(
    `update requests set
       status = 'paid',
       paid_spend_job_id = $3::uuid,
       updated_at = now()
     where id = $1::uuid
       and payer_user_id = $2::uuid
       and status = 'open'
       and exists (
         select 1
         from spend_jobs
         where spend_jobs.id = $3::uuid
           and spend_jobs.user_id = $2::uuid
           and spend_jobs.request_id = requests.id
           and spend_jobs.status = 'completed'
       )
     returning *`,
    [input.requestId, input.payerUserId, input.spendJobId],
  );
  return one(result);
}

export async function recordActivityEvent(
  db: QueryClient,
  input: {
    userId: string;
    eventType: string;
    eventData?: Record<string, unknown>;
    jobId?: string | null;
    spendJobId?: string | null;
    noteId?: string | null;
    requestId?: string | null;
    txHash?: string | null;
  },
): Promise<ActivityEventRow | null> {
  const result = await db.query<ActivityEventRow>(
    `insert into activity_events (
       user_id,
       job_id,
       spend_job_id,
       note_id,
       request_id,
       event_type,
       event_data,
       tx_hash
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      input.userId,
      input.jobId ?? null,
      input.spendJobId ?? null,
      input.noteId ?? null,
      input.requestId ?? null,
      input.eventType,
      input.eventData ?? {},
      input.txHash ?? null,
    ],
  );
  return one(result);
}

export async function createNotification(
  db: QueryClient,
  input: {
    userId: string;
    activityEventId?: string | null;
    type: string;
    severity?: "info" | "success" | "warning" | "error";
    entityKind: string;
    entityId?: string | null;
    title: string;
    body?: string | null;
    actionUrl?: string | null;
  },
): Promise<NotificationRow | null> {
  const result = await db.query<NotificationRow>(
    `insert into notification_inbox (
       user_id,
       activity_event_id,
       type,
       severity,
       entity_kind,
       entity_id,
       title,
       body,
       action_url
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      input.userId,
      input.activityEventId ?? null,
      input.type,
      input.severity ?? "info",
      input.entityKind,
      input.entityId ?? null,
      input.title,
      input.body ?? null,
      input.actionUrl ?? null,
    ],
  );
  return one(result);
}

export async function listNotifications(
  db: QueryClient,
  input: { userId: string; unreadOnly?: boolean; limit?: number },
): Promise<NotificationRow[]> {
  const result = await db.query<NotificationRow>(
    `select *
     from notification_inbox
     where user_id = $1
       and ($2::boolean is false or read_at is null)
     order by created_at desc
     limit $3`,
    [input.userId, input.unreadOnly === true, input.limit ?? 50],
  );
  return result.rows;
}

export async function markNotificationsRead(
  db: QueryClient,
  input: { userId: string; notificationIds: string[] },
): Promise<NotificationRow[]> {
  if (input.notificationIds.length === 0) return [];
  const result = await db.query<NotificationRow>(
    `update notification_inbox set
       read_at = coalesce(read_at, now()),
       seen_at = coalesce(seen_at, now()),
       updated_at = now()
     where user_id = $1
       and id = any($2::uuid[])
     returning *`,
    [input.userId, input.notificationIds],
  );
  return result.rows;
}

export async function getWalletBadgeCounts(
  db: QueryClient,
  input: { userId: string },
): Promise<WalletBadgeCounts> {
  const result = await db.query<{
    incoming_contact_requests: string | number;
    open_payment_requests: string | number;
    unread_notifications: string | number;
    recoverable_jobs: string | number;
  }>(
    `select
       (
         select count(*)
         from contacts
         where contact_user_id = $1::uuid
           and status = 'pending'
       ) as incoming_contact_requests,
       (
         select count(*)
         from requests
         where payer_user_id = $1::uuid
           and status = 'open'
       ) as open_payment_requests,
       (
         select count(*)
         from notification_inbox
         where user_id = $1::uuid
           and read_at is null
       ) as unread_notifications,
       (
         select count(*)
         from spend_jobs
         where user_id = $1::uuid
           and status in ('waiting_retry', 'needs_reconcile', 'failed_recoverable')
       ) + (
         select count(*)
         from requests
         where (requester_user_id = $1::uuid or payer_user_id = $1::uuid)
           and status = 'failed_recoverable'
       ) as recoverable_jobs`,
    [input.userId],
  );
  const row = result.rows[0];
  return {
    incomingContactRequests: Number(row?.incoming_contact_requests ?? 0),
    openPaymentRequests: Number(row?.open_payment_requests ?? 0),
    unreadNotifications: Number(row?.unread_notifications ?? 0),
    recoverableJobs: Number(row?.recoverable_jobs ?? 0),
  };
}

export async function createPublicTransaction(
  db: QueryClient,
  input: {
    userId: string;
    sourcePublicKey: string;
    destinationPublicKey?: string | null;
    kind: "payment" | "trustline" | "swap" | "funding";
    assetCode?: string | null;
    amountUnits?: string | null;
    txHash: string;
    ledger?: number | null;
    status?: "pending" | "submitted" | "confirmed" | "failed";
    metadata?: Record<string, unknown>;
  },
): Promise<PublicTransactionRow | null> {
  const result = await db.query<PublicTransactionRow>(
    `insert into public_transactions (
       user_id,
       source_public_key,
       destination_public_key,
       kind,
       asset_code,
       amount_units,
       tx_hash,
       ledger,
       status,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (user_id, tx_hash) do update set
       destination_public_key = coalesce(excluded.destination_public_key, public_transactions.destination_public_key),
       kind = excluded.kind,
       asset_code = coalesce(excluded.asset_code, public_transactions.asset_code),
       amount_units = coalesce(excluded.amount_units, public_transactions.amount_units),
       ledger = coalesce(excluded.ledger, public_transactions.ledger),
       status = excluded.status,
       metadata = public_transactions.metadata || excluded.metadata,
       updated_at = now()
     returning *`,
    [
      input.userId,
      input.sourcePublicKey,
      input.destinationPublicKey ?? null,
      input.kind,
      input.assetCode ?? null,
      input.amountUnits ?? null,
      input.txHash,
      input.ledger ?? null,
      input.status ?? "confirmed",
      input.metadata ?? {},
    ],
  );
  return one(result);
}

export async function listPublicTransactions(
  db: QueryClient,
  input: { userId: string; limit?: number },
): Promise<PublicTransactionRow[]> {
  const result = await db.query<PublicTransactionRow>(
    `select *
     from public_transactions
     where user_id = $1
     order by created_at desc
     limit $2`,
    [input.userId, input.limit ?? 50],
  );
  return result.rows;
}

export interface SpendJobRecipientInput {
  address: string;
  amountUnits: string;
  recipientUserId?: string | null;
  recipientHandle?: string | null;
  recipientNotePublicHex?: string | null;
  recipientX25519PublicHex?: string | null;
}

export async function appendSpendJobEvent(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    eventType: string;
    eventData?: Record<string, unknown>;
    txHash?: string | null;
  },
): Promise<ActivityEventRow | null> {
  return recordActivityEvent(db, {
    userId: input.userId,
    spendJobId: input.jobId,
    eventType: input.eventType,
    eventData: input.eventData ?? {},
    txHash: input.txHash ?? null,
  });
}

export async function getSpendJobDetail(
  db: QueryClient,
  input: { userId: string; jobId: string },
): Promise<SpendJobDetail | null> {
  const job = one(
    await db.query<SpendJobRow>(
      `select *
       from spend_jobs
       where user_id = $1 and id = $2
       limit 1`,
      [input.userId, input.jobId],
    ),
  );
  if (!job) return null;
  const steps = await db.query<SpendJobStepRow>(
    `select *
     from spend_job_steps
     where user_id = $1 and job_id = $2
     order by ordinal asc`,
    [input.userId, input.jobId],
  );
  return { job, steps: steps.rows };
}

export async function listSpendJobs(
  db: QueryClient,
  input: { userId: string; limit?: number },
): Promise<SpendJobDetail[]> {
  const jobs = await db.query<SpendJobRow>(
    `select *
     from spend_jobs
     where user_id = $1
     order by created_at desc
     limit $2`,
    [input.userId, input.limit ?? 30],
  );
  if (jobs.rows.length === 0) return [];

  const steps = await db.query<SpendJobStepRow>(
    `select *
     from spend_job_steps
     where user_id = $1 and job_id = any($2::uuid[])
     order by job_id, ordinal asc`,
    [input.userId, jobs.rows.map((job) => job.id)],
  );
  const stepsByJob = new Map<string, SpendJobStepRow[]>();
  for (const step of steps.rows) {
    const current = stepsByJob.get(step.job_id) ?? [];
    current.push(step);
    stepsByJob.set(step.job_id, current);
  }
  return jobs.rows.map((job) => ({ job, steps: stepsByJob.get(job.id) ?? [] }));
}

export async function listSpendJobEvents(
  db: QueryClient,
  input: { userId: string; afterEventId?: string | null; limit?: number },
): Promise<ActivityEventRow[]> {
  const result = await db.query<ActivityEventRow>(
    `select *
     from activity_events
     where user_id = $1
       and ($2::uuid is null or created_at > coalesce(
         (select created_at from activity_events where id = $2::uuid and user_id = $1),
         '-infinity'::timestamptz
       ))
     order by created_at asc, id asc
     limit $3`,
    [input.userId, input.afterEventId ?? null, input.limit ?? 100],
  );
  return result.rows;
}

export async function listWalletEvents(
  db: QueryClient,
  input: { userId: string; afterEventId?: string | null; limit?: number },
): Promise<ActivityEventRow[]> {
  return listSpendJobEvents(db, input);
}

export async function getLatestWalletEventId(
  db: QueryClient,
  input: { userId: string },
): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `select id
     from activity_events
     where user_id = $1
     order by created_at desc, id desc
     limit 1`,
    [input.userId],
  );
  return result.rows[0]?.id ?? null;
}

export async function createSpendJob(
  db: QueryClient,
  input: {
    jobId?: string | null;
    kind?: "lane1_withdraw" | "lane2_transfer";
    userId: string;
    requestId?: string | null;
    idempotencyKey: string;
    sourceNoteId: string;
    sourceCommitmentHex: string;
    sourceAmountUnits: string;
    sourceLeafIndex: number | null;
    poolId: string;
    totalAmountUnits: string;
    recipients: SpendJobRecipientInput[];
    executionMode?: "interactive" | "background";
    executionPackageCiphertext?: string | null;
    executionPackageExpiresAt?: Date | null;
  },
): Promise<SpendJobDetail> {
  return withTransaction(db, async (client) => {
    const jobId = input.jobId ?? randomUUID();
    const existing = one(
      await client.query<SpendJobRow>(
        `select *
         from spend_jobs
         where user_id = $1 and idempotency_key = $2
         limit 1`,
        [input.userId, input.idempotencyKey],
      ),
    );
    if (existing) {
      const detail = await getSpendJobDetail(client, {
        userId: input.userId,
        jobId: existing.id,
      });
      if (!detail) throw new Error("Existing spend job could not be loaded");
      return detail;
    }

    const sourceNote = one(
      await client.query<NoteRow>(
        `select *
         from notes
         where user_id = $1
           and id = $2
           and commitment_hex = $3
           and status in ('unspent', 'received')
           and active_job_id is null
         for update`,
        [input.userId, input.sourceNoteId, input.sourceCommitmentHex],
      ),
    );
    if (!sourceNote) {
      throw new Error("Selected note is not available for spending");
    }

    if (input.requestId) {
      const request = one(
        await client.query<
          PaymentRequestRow & {
            requester_bn254_public_hex: string | null;
            requester_x25519_public_hex: string | null;
          }
        >(
          `select
             r.*,
             requester.bn254_public_hex as requester_bn254_public_hex,
             requester.x25519_public_hex as requester_x25519_public_hex
           from requests r
           join wallet_profiles requester on requester.user_id = r.requester_user_id
           where r.id = $2::uuid
             and r.payer_user_id = $1::uuid
             and r.status = 'open'
             and (r.expires_at is null or r.expires_at > now())
           for update`,
          [input.userId, input.requestId],
        ),
      );
      if (!request) {
        throw new Error("Payment request is not open for this wallet");
      }
      if (input.kind !== "lane2_transfer") {
        throw new Error("Payment requests must be paid with Note-2-Note");
      }
      if (request.amount_units !== input.totalAmountUnits) {
        throw new Error("Payment request amount does not match spend job amount");
      }
      if (input.recipients.length !== 1) {
        throw new Error("Payment requests must have exactly one Note-2-Note recipient");
      }
      const requestRecipient = input.recipients[0];
      if (requestRecipient.recipientUserId !== request.requester_user_id) {
        throw new Error("Payment request recipient must match the requester");
      }
      if (
        requestRecipient.recipientNotePublicHex !== request.requester_bn254_public_hex ||
        requestRecipient.recipientX25519PublicHex !== request.requester_x25519_public_hex
      ) {
        throw new Error("Payment request recipient keys must match the requester");
      }
    }

    const executionMode = input.executionMode ?? "interactive";
    if (executionMode === "background" && !input.executionPackageCiphertext) {
      throw new Error("Background spend jobs require an encrypted execution package");
    }

    const inserted = one(
      await client.query<SpendJobRow>(
        `insert into spend_jobs (
           id,
           user_id,
           request_id,
           kind,
           status,
           idempotency_key,
           source_note_id,
           source_commitment_hex,
           source_amount_units,
           source_leaf_index,
           active_note_id,
           active_commitment_hex,
           active_amount_units,
           active_leaf_index,
           pool_id,
           total_amount_units,
           total_recipients,
           execution_mode,
           execution_package_ciphertext,
           execution_package_expires_at
         )
         values ($15::uuid, $1, $11::uuid, $10, 'queued', $2, $3, $4, $5, $6, $3, $4, $5, $6, $7, $8, $9, $12, $13, $14)
         returning *`,
        [
          input.userId,
          input.idempotencyKey,
          input.sourceNoteId,
          input.sourceCommitmentHex,
          input.sourceAmountUnits,
          input.sourceLeafIndex,
          input.poolId,
          input.totalAmountUnits,
          input.recipients.length,
          input.kind ?? "lane1_withdraw",
          input.requestId ?? null,
          executionMode,
          executionMode === "background" ? input.executionPackageCiphertext : null,
          executionMode === "background" ? input.executionPackageExpiresAt ?? null : null,
          jobId,
        ],
      ),
    );
    if (!inserted) throw new Error("Spend job could not be created");

    await client.query(
      `update notes set
         status = 'pending_spend',
         active_job_id = $2::uuid,
         spend_version = spend_version + 1,
         updated_at = now()
       where user_id = $1 and id = $3`,
      [input.userId, inserted.id, input.sourceNoteId],
    );

    for (let index = 0; index < input.recipients.length; index += 1) {
      const recipient = input.recipients[index];
      await client.query(
        `insert into spend_job_steps (
           job_id,
           user_id,
           ordinal,
           recipient_address,
           amount_units,
           status,
           source_note_id,
           source_commitment_hex,
           source_amount_units,
           source_leaf_index,
           recipient_user_id,
           recipient_handle,
           recipient_note_public_hex,
           recipient_x25519_public_hex
         )
         values ($1, $2, $3, $4, $5, 'queued', $6, $7, $8, $9, $10::uuid, $11, $12, $13)`,
        [
          inserted.id,
          input.userId,
          index + 1,
          recipient.address,
          recipient.amountUnits,
          input.sourceNoteId,
          input.sourceCommitmentHex,
          input.sourceAmountUnits,
          input.sourceLeafIndex,
          recipient.recipientUserId ?? null,
          recipient.recipientHandle ?? null,
          recipient.recipientNotePublicHex ?? null,
          recipient.recipientX25519PublicHex ?? null,
        ],
      );
    }

    await appendSpendJobEvent(client, {
      userId: input.userId,
      jobId: inserted.id,
      eventType: "spend_job_created",
      eventData: {
        totalRecipients: input.recipients.length,
        totalAmountUnits: input.totalAmountUnits,
      },
    });

    const detail = await getSpendJobDetail(client, {
      userId: input.userId,
      jobId: inserted.id,
    });
    if (!detail) throw new Error("Spend job detail could not be loaded");
    return detail;
  });
}

export async function getNextBackgroundSpendJobCandidate(
  db: QueryClient,
  input: { limit?: number } = {},
): Promise<{ job: SpendJobRow } | null> {
  const result = await db.query<SpendJobRow>(
    `select j.*
     from spend_jobs j
     join spend_job_steps s on s.job_id = j.id
     where j.execution_mode = 'background'
       and j.execution_package_ciphertext is not null
       and j.execution_package_deleted_at is null
       and j.execution_package_expires_at is not null
       and j.status in ('queued', 'running', 'waiting_retry', 'paused_needs_unlock')
       and s.status in ('queued', 'retry_wait', 'proof_ready', 'proving', 'relaying')
	       and s.tx_hash is null
	       and (s.retry_after is null or s.retry_after <= now())
	       and (
	         s.status = 'proof_ready'
	         or (s.status = 'relaying' and s.tx_hash is null and s.lease_expires_at <= now())
	         or s.lease_expires_at <= now()
	         or (s.status in ('queued', 'retry_wait') and s.lease_expires_at is null)
	       )
     order by j.created_at asc, s.ordinal asc
     limit $1`,
    [input.limit ?? 1],
  );
  const job = one(result);
  return job ? { job } : null;
}

export async function updateSpendJobExecutionPackage(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    encryptedPackageCiphertext: string;
    expiresAt: Date;
  },
): Promise<void> {
  assertMutation(
    await db.query(
      `update spend_jobs set
         execution_package_ciphertext = $3,
         execution_package_expires_at = $4,
         execution_package_deleted_at = null,
         updated_at = now()
       where user_id = $1
         and id = $2
         and execution_mode = 'background'
         and status not in ('completed', 'canceled')`,
      [
        input.userId,
        input.jobId,
        input.encryptedPackageCiphertext,
        input.expiresAt,
      ],
    ),
    "Background execution package could not be updated",
  );
}

export async function deleteSpendJobExecutionPackage(
  db: QueryClient,
  input: { userId: string; jobId: string; reason: string },
): Promise<void> {
  assertMutation(
    await db.query(
      `update spend_jobs set
         execution_package_ciphertext = null,
         status = case
           when $3 = 'expired' then 'paused_needs_unlock'
           else status
         end,
         error_class = case
           when $3 = 'expired' then 'execution_package_expired'
           else error_class
         end,
         error_message = case
           when $3 = 'expired' then 'Background execution package expired. Unlock wallet to resume this job.'
           else error_message
         end,
         execution_package_deleted_at = now(),
         updated_at = now()
       where user_id = $1
         and id = $2
         and execution_mode = 'background'
         and execution_package_deleted_at is null`,
      [input.userId, input.jobId, input.reason],
    ),
    "Background execution package could not be deleted",
  );
  await appendSpendJobEvent(db, {
    userId: input.userId,
    jobId: input.jobId,
    eventType: "spend_job_execution_package_deleted",
    eventData: { reason: input.reason },
  });
}

export async function getNextRunnableSpendJobStep(
  db: QueryClient,
  input: { userId: string; jobId: string },
): Promise<{ job: SpendJobRow; step: SpendJobStepRow } | null> {
  const result = await db.query<SpendJobRow & { step_id: string }>(
    `select j.*, s.id as step_id
     from spend_jobs j
     join spend_job_steps s on s.job_id = j.id
	     where j.user_id = $1
	       and j.id = $2
	       and j.status in ('queued', 'running', 'waiting_retry', 'paused_needs_unlock')
	       and s.status in ('queued', 'retry_wait', 'proof_ready')
	       and s.tx_hash is null
	       and (s.retry_after is null or s.retry_after <= now())
	     order by s.ordinal asc
	     limit 1`,
    [input.userId, input.jobId],
  );
  const selected = one(result);
  if (!selected) return null;
  const detail = await getSpendJobDetail(db, input);
  const step = detail?.steps.find((item) => item.id === selected.step_id);
  if (!detail || !step) return null;
  return { job: detail.job, step };
}

export async function claimNextRunnableSpendJobStep(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    sourceCommitmentHex: string;
    sourceAmountUnits: string;
    sourceLeafIndex: number | null;
    leaseOwner?: string;
    leaseSeconds?: number;
  },
): Promise<{ job: SpendJobRow; step: SpendJobStepRow } | null> {
  const leaseOwner = input.leaseOwner ?? "interactive-runner";
  const leaseSeconds = Math.max(30, Math.min(input.leaseSeconds ?? 120, 900));

  return withTransaction(db, async (client) => {
    const claimed = one(
      await client.query<SpendJobStepRow>(
        `with next_step as (
           select s.id
           from spend_jobs j
           join spend_job_steps s on s.job_id = j.id
           where j.user_id = $1
             and j.id = $2
             and j.status in ('queued', 'running', 'waiting_retry', 'paused_needs_unlock')
	             and j.active_commitment_hex = $3
	             and j.active_amount_units = $4
	             and j.active_leaf_index is not distinct from $5
	             and s.status in ('queued', 'retry_wait', 'proof_ready', 'proving', 'relaying')
	             and s.tx_hash is null
	             and s.source_commitment_hex = $3
	             and s.source_amount_units = $4
	             and s.source_leaf_index is not distinct from $5
             and (s.retry_after is null or s.retry_after <= now())
	             and (
	               s.status = 'proof_ready'
	               or (s.status = 'relaying' and s.tx_hash is null and s.lease_expires_at <= now())
	               or s.lease_expires_at <= now()
	               or (s.status in ('queued', 'retry_wait') and s.lease_expires_at is null)
	             )
             and not exists (
               select 1
               from spend_job_steps previous
               where previous.user_id = s.user_id
                 and previous.job_id = s.job_id
                 and previous.ordinal < s.ordinal
                 and previous.status <> 'confirmed'
             )
           order by s.ordinal asc
           limit 1
           for update of s skip locked
         )
	         update spend_job_steps s set
	           status = 'proving',
	           attempts = attempts + 1,
	           relay_body = null,
	           input_nullifier_hex = null,
	           output_commitment_hex = null,
	           output_amount_units = null,
	           output_leaf_index = null,
	           encrypted_change_note_ciphertext = null,
	           error_class = null,
	           error_message = null,
	           retry_after = null,
             lease_owner = $6,
             lease_expires_at = now() + make_interval(secs => $7),
             last_heartbeat_at = now(),
           updated_at = now()
         from next_step
         where s.id = next_step.id
         returning s.*`,
        [
          input.userId,
          input.jobId,
          input.sourceCommitmentHex,
          input.sourceAmountUnits,
          input.sourceLeafIndex,
          leaseOwner,
          leaseSeconds,
        ],
      ),
    );

    if (!claimed) return null;

    assertMutation(
      await client.query(
        `update spend_jobs set
           status = 'running',
           lease_owner = $3,
           lease_expires_at = now() + make_interval(secs => $4),
           last_heartbeat_at = now(),
           updated_at = now()
         where user_id = $1
           and id = $2
           and status in ('queued', 'running', 'waiting_retry', 'paused_needs_unlock')`,
        [input.userId, input.jobId, leaseOwner, leaseSeconds],
      ),
      "Spend job is no longer runnable",
    );

    await appendSpendJobEvent(client, {
      userId: input.userId,
      jobId: input.jobId,
      eventType: "spend_job_step_proving",
      eventData: { stepId: claimed.id },
    });

    const detail = await getSpendJobDetail(client, input);
    const step = detail?.steps.find((item) => item.id === claimed.id);
    if (!detail || !step) {
      throw new Error("Claimed spend job step could not be loaded");
    }
    return { job: detail.job, step };
  });
}

export async function markSpendJobStepProving(
  db: QueryClient,
  input: { userId: string; jobId: string; stepId: string },
): Promise<void> {
  assertMutation(
    await db.query(
      `update spend_job_steps set
         status = 'proving',
         attempts = attempts + 1,
         error_class = null,
         error_message = null,
         retry_after = null,
         updated_at = now()
       where user_id = $1
         and job_id = $2
         and id = $3
         and status in ('queued', 'retry_wait')`,
      [input.userId, input.jobId, input.stepId],
    ),
    "Spend job step is no longer runnable",
  );
  assertMutation(
    await db.query(
      `update spend_jobs set status = 'running', updated_at = now()
       where user_id = $1
         and id = $2
         and status in ('queued', 'running', 'waiting_retry', 'paused_needs_unlock')`,
      [input.userId, input.jobId],
    ),
    "Spend job is no longer runnable",
  );
  await appendSpendJobEvent(db, {
    userId: input.userId,
    jobId: input.jobId,
    eventType: "spend_job_step_proving",
    eventData: { stepId: input.stepId },
  });
}

export async function markSpendJobStepProofReady(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    stepId: string;
    relayBody: Record<string, unknown>;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    inputNullifierHex?: string | null;
    recipientOutputCommitmentHex?: string | null;
    recipientEncryptedOutput?: string | null;
  },
): Promise<void> {
  assertMutation(
    await db.query(
      `update spend_job_steps set
         status = 'proof_ready',
         relay_body = $4,
         input_nullifier_hex = coalesce($7, input_nullifier_hex),
         output_commitment_hex = $5,
         output_amount_units = $6,
         recipient_output_commitment_hex = coalesce($8, recipient_output_commitment_hex),
	         recipient_encrypted_output = coalesce($9, recipient_encrypted_output),
	         error_class = null,
	         error_message = null,
	         retry_after = null,
	         lease_owner = null,
	         lease_expires_at = null,
	         last_heartbeat_at = null,
	         updated_at = now()
       where user_id = $1
         and job_id = $2
         and id = $3
         and status = 'proving'`,
      [
        input.userId,
        input.jobId,
        input.stepId,
        input.relayBody,
        input.outputCommitmentHex,
        input.outputAmountUnits,
        input.inputNullifierHex ?? null,
        input.recipientOutputCommitmentHex ?? null,
        input.recipientEncryptedOutput ?? null,
      ],
    ),
    "Spend job step is no longer proving",
  );
  await appendSpendJobEvent(db, {
    userId: input.userId,
    jobId: input.jobId,
    eventType: "spend_job_step_proof_ready",
    eventData: {
      stepId: input.stepId,
      outputCommitmentHex: input.outputCommitmentHex,
      recipientOutputCommitmentHex: input.recipientOutputCommitmentHex ?? null,
    },
  });
}

export async function markSpendJobStepRelaying(
  db: QueryClient,
  input: { userId: string; jobId: string; stepId: string },
): Promise<void> {
  assertMutation(
    await db.query(
      `update spend_job_steps set
         status = 'relaying',
         updated_at = now()
       where user_id = $1
         and job_id = $2
         and id = $3
         and status = 'proof_ready'`,
      [input.userId, input.jobId, input.stepId],
    ),
    "Spend job step is no longer proof-ready",
  );
  await appendSpendJobEvent(db, {
    userId: input.userId,
    jobId: input.jobId,
    eventType: "spend_job_step_relaying",
    eventData: { stepId: input.stepId },
  });
}

export async function lockSpendJobStep(
  db: QueryClient,
  input: { userId: string; jobId: string; stepId: string },
): Promise<void> {
  await markSpendJobStepRelaying(db, input);
}

export async function markSpendJobSubmitted(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    stepId: string;
    txHash: string;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    encryptedChangeNoteCiphertext?: string | null;
  },
): Promise<void> {
  assertMutation(
    await db.query(
      `update spend_job_steps set
         status = 'submitted',
         tx_hash = $4,
         output_commitment_hex = $5,
         output_amount_units = $6,
         encrypted_change_note_ciphertext = coalesce($7, encrypted_change_note_ciphertext),
         error_class = null,
         error_message = null,
         lease_owner = null,
         lease_expires_at = null,
         last_heartbeat_at = null,
         updated_at = now()
       where user_id = $1
         and job_id = $2
         and id = $3
         and status = 'relaying'`,
      [
        input.userId,
        input.jobId,
        input.stepId,
        input.txHash,
        input.outputCommitmentHex,
        input.outputAmountUnits,
        input.encryptedChangeNoteCiphertext ?? null,
      ],
    ),
    "Spend job step is no longer relaying",
  );
  await appendSpendJobEvent(db, {
    userId: input.userId,
    jobId: input.jobId,
    eventType: "spend_job_step_submitted",
    eventData: {
      stepId: input.stepId,
      outputCommitmentHex: input.outputCommitmentHex,
    },
    txHash: input.txHash,
  });
}

export async function markSpendJobRetryableFailure(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    stepId: string;
    errorClass: string;
    errorMessage: string;
    retryAfter?: Date | null;
  },
): Promise<void> {
  const retryAfter = input.retryAfter ?? new Date(Date.now() + 15_000);
  const failedStep = one(
    await db.query<SpendJobStepRow>(
      `update spend_job_steps set
         status = case
           when attempts >= $7 then 'failed_final'
           else 'retry_wait'
         end,
         error_class = $4,
         error_message = $5,
         retry_after = case
           when attempts >= $7 then null
           else $6::timestamptz
         end,
         lease_owner = null,
         lease_expires_at = null,
         last_heartbeat_at = null,
         updated_at = now()
       where user_id = $1
         and job_id = $2
         and id = $3
         and status not in ('confirmed', 'failed_final', 'needs_reconcile')
       returning *`,
      [
        input.userId,
        input.jobId,
        input.stepId,
        input.errorClass,
        input.errorMessage,
        retryAfter,
        MAX_SPEND_JOB_STEP_ATTEMPTS,
      ],
    ),
  );
  assertMutation(
    { rowCount: failedStep ? 1 : 0, rows: failedStep ? [failedStep] : [] },
    "Spend job step is no longer retryable",
  );
  assertMutation(
    await db.query(
      `update spend_jobs set
         status = case
           when failed_step.status = 'failed_final' then 'failed_recoverable'
           else 'waiting_retry'
         end,
         error_class = $3,
         error_message = $4,
         retry_after = case
           when failed_step.status = 'failed_final' then null
           else $5::timestamptz
         end,
         reconcile_after = case
           when failed_step.status = 'failed_final' then now()
           else null
         end,
         lease_owner = null,
         lease_expires_at = null,
         last_heartbeat_at = null,
         updated_at = now()
       from (
         select status
         from spend_job_steps
         where user_id = $1 and job_id = $2 and id = $6
       ) failed_step
       where user_id = $1
         and id = $2
         and status <> 'completed'`,
      [
        input.userId,
        input.jobId,
        input.errorClass,
        input.errorMessage,
        retryAfter,
        input.stepId,
      ],
    ),
    "Spend job is already completed",
  );
  const eventType =
    failedStep?.status === "failed_final"
      ? "spend_job_failed_recoverable"
      : "spend_job_retry_wait";
  await appendSpendJobEvent(db, {
    userId: input.userId,
    jobId: input.jobId,
    eventType,
    eventData: {
      stepId: input.stepId,
      errorClass: input.errorClass,
      retryAfter:
        failedStep?.status === "failed_final" ? null : retryAfter.toISOString(),
      maxAttempts: MAX_SPEND_JOB_STEP_ATTEMPTS,
    },
  });
}

export async function markSpendJobNeedsReconcile(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    stepId: string;
    errorClass: string;
    errorMessage: string;
  },
): Promise<void> {
  assertMutation(
    await db.query(
      `update spend_job_steps set
         status = 'needs_reconcile',
         error_class = $4,
         error_message = $5,
         retry_after = null,
         lease_owner = null,
         lease_expires_at = null,
         last_heartbeat_at = null,
         updated_at = now()
       where user_id = $1
         and job_id = $2
         and id = $3
         and status not in ('confirmed', 'failed_final')`,
      [
        input.userId,
        input.jobId,
        input.stepId,
        input.errorClass,
        input.errorMessage,
      ],
    ),
    "Spend job step is no longer reconcilable",
  );
  assertMutation(
    await db.query(
      `update spend_jobs set
         status = 'needs_reconcile',
         error_class = $3,
         error_message = $4,
         retry_after = null,
         reconcile_after = now(),
         lease_owner = null,
         lease_expires_at = null,
         last_heartbeat_at = null,
         updated_at = now()
       where user_id = $1
         and id = $2
         and status <> 'completed'`,
      [input.userId, input.jobId, input.errorClass, input.errorMessage],
    ),
    "Spend job is already completed",
  );
  await db.query(
    `update notes set
       status = 'failed_recovery',
       last_chain_checked_at = now(),
       updated_at = now()
     where user_id = $1
       and (
         active_job_id = $2::uuid
         or id = (
           select source_note_id
           from spend_job_steps
           where user_id = $1 and job_id = $2 and id = $3
         )
       )
       and status in ('unspent', 'received', 'pending_spend')`,
    [input.userId, input.jobId, input.stepId],
  );
  await appendSpendJobEvent(db, {
    userId: input.userId,
    jobId: input.jobId,
    eventType: "spend_job_needs_reconcile",
    eventData: {
      stepId: input.stepId,
      errorClass: input.errorClass,
      errorMessage: input.errorMessage,
    },
  });
}

export async function storeSpendJobStepResult(
  db: QueryClient,
  input: {
    userId: string;
    jobId: string;
    stepId: string;
    sourceNoteId: string;
    changeNote: {
      commitmentHex: string;
      encryptedNoteCiphertext: string;
      amountUnits: string;
      leafIndex: number;
      txHash: string;
    } | null;
    recipientNote?: {
      recipientUserId: string;
      commitmentHex: string;
      amountUnits: string;
      encryptedOutput: string;
      leafIndex: number;
      txHash: string;
    } | null;
    isFinalStep: boolean;
  },
): Promise<void> {
  await withTransaction(db, async (client) => {
    let changeNoteId: string | null = null;
    if (input.changeNote && BigInt(input.changeNote.amountUnits) > BigInt(0)) {
      const inserted = one(
        await client.query<NoteRow>(
          `insert into notes (
             user_id,
             commitment_hex,
             encrypted_note_ciphertext,
             asset_code,
             amount_units,
             leaf_index,
             status,
             source,
             tx_hash,
             active_job_id
           )
           values (
             $1,
             $2,
             $3,
             'USDC',
             $4,
             $5,
             case when $8::boolean then 'unspent' else 'pending_spend' end,
             'change',
             $6,
             case when $8::boolean then null::uuid else $7::uuid end
           )
           on conflict (user_id, commitment_hex) do update set
             encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
             amount_units = excluded.amount_units,
             leaf_index = excluded.leaf_index,
             status = excluded.status,
             source = 'change',
             tx_hash = excluded.tx_hash,
             active_job_id = excluded.active_job_id,
             updated_at = now()
           returning *`,
          [
            input.userId,
            input.changeNote.commitmentHex,
            input.changeNote.encryptedNoteCiphertext,
            input.changeNote.amountUnits,
            input.changeNote.leafIndex,
            input.changeNote.txHash,
            input.jobId,
            input.isFinalStep,
          ],
        ),
      );
      changeNoteId = inserted?.id ?? null;
    }

    await client.query(
      `update notes set
         status = 'spent',
         active_job_id = null,
         updated_at = now()
       where user_id = $1 and id = $2`,
      [input.userId, input.sourceNoteId],
    );

    assertMutation(
      await client.query(
        `update spend_job_steps set
           status = 'confirmed',
           output_leaf_index = coalesce($4, output_leaf_index),
           encrypted_change_note_ciphertext = coalesce($5, encrypted_change_note_ciphertext),
           recipient_output_commitment_hex = coalesce($6, recipient_output_commitment_hex),
           recipient_output_leaf_index = coalesce($7, recipient_output_leaf_index),
           recipient_encrypted_output = coalesce($8, recipient_encrypted_output),
           error_class = null,
           error_message = null,
           retry_after = null,
           lease_owner = null,
           lease_expires_at = null,
           last_heartbeat_at = null,
           updated_at = now()
         where user_id = $1
           and job_id = $2
           and id = $3
           and (
             status = 'submitted'
             or (status in ('needs_reconcile', 'retry_wait', 'relaying') and tx_hash is not null)
           )`,
        [
          input.userId,
          input.jobId,
          input.stepId,
          input.changeNote?.leafIndex ?? null,
          input.changeNote?.encryptedNoteCiphertext ?? null,
          input.recipientNote?.commitmentHex ?? null,
          input.recipientNote?.leafIndex ?? null,
          input.recipientNote?.encryptedOutput ?? null,
        ],
      ),
      "Spend job step is no longer submitted",
    );

    if (input.recipientNote) {
      const incomingNote = one(
        await client.query<IncomingNoteRow>(
        `insert into incoming_notes (
           recipient_user_id,
           sender_user_id,
           spend_job_id,
           spend_job_step_id,
           commitment_hex,
           amount_units,
           encrypted_output,
           tx_hash,
           leaf_index,
           status
         )
         values ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, 'pending')
         on conflict (recipient_user_id, commitment_hex) do update set
           sender_user_id = coalesce(excluded.sender_user_id, incoming_notes.sender_user_id),
           spend_job_id = coalesce(excluded.spend_job_id, incoming_notes.spend_job_id),
           spend_job_step_id = coalesce(excluded.spend_job_step_id, incoming_notes.spend_job_step_id),
           amount_units = excluded.amount_units,
           encrypted_output = excluded.encrypted_output,
           tx_hash = coalesce(excluded.tx_hash, incoming_notes.tx_hash),
           leaf_index = coalesce(excluded.leaf_index, incoming_notes.leaf_index),
           status = case
             when incoming_notes.status = 'claimed' then incoming_notes.status
             else 'pending'
           end,
           updated_at = now()
         returning *`,
        [
          input.recipientNote.recipientUserId,
          input.userId,
          input.jobId,
          input.stepId,
          input.recipientNote.commitmentHex,
          input.recipientNote.amountUnits,
          input.recipientNote.encryptedOutput,
          input.recipientNote.txHash,
          input.recipientNote.leafIndex,
        ],
        ),
      );
      const recipientActivity = await recordActivityEvent(client, {
        userId: input.recipientNote.recipientUserId,
        spendJobId: input.jobId,
        eventType: "private_note_received",
        eventData: {
          spendJobId: input.jobId,
          stepId: input.stepId,
          amountUnits: input.recipientNote.amountUnits,
          commitmentHex: input.recipientNote.commitmentHex,
        },
        txHash: input.recipientNote.txHash,
      });
      await createNotification(client, {
        userId: input.recipientNote.recipientUserId,
        activityEventId: recipientActivity?.id,
        type: "private_note_received",
        severity: "success",
        entityKind: "incoming_note",
        entityId: incomingNote?.id,
        title: "Private note received",
        body: `${input.recipientNote.amountUnits} USDC is ready to claim.`,
        actionUrl: "/wallet?mode=private&tab=dashboard",
      });
    }

    if (!input.isFinalStep && input.changeNote && changeNoteId) {
      await client.query(
        `update spend_job_steps set
           source_note_id = $4::uuid,
           source_commitment_hex = $5,
           source_amount_units = $6,
           source_leaf_index = $7,
           updated_at = now()
         where user_id = $1
           and job_id = $2
           and ordinal = (
             select ordinal + 1
             from spend_job_steps
             where user_id = $1 and job_id = $2 and id = $3
           )`,
        [
          input.userId,
          input.jobId,
          input.stepId,
          changeNoteId,
          input.changeNote.commitmentHex,
          input.changeNote.amountUnits,
          input.changeNote.leafIndex,
        ],
      );
    }

    assertMutation(
      await client.query(
        `update spend_jobs set
           status = case
             when (select count(*) from spend_job_steps where user_id = $1 and job_id = $2 and status = 'confirmed') = total_recipients then 'completed'
             when exists (select 1 from spend_job_steps where user_id = $1 and job_id = $2 and status = 'needs_reconcile') then 'needs_reconcile'
             when execution_mode = 'background'
               and execution_package_ciphertext is not null
               and execution_package_deleted_at is null then 'running'
             else 'paused_needs_unlock'
           end,
           completed_count = (
             select count(*) from spend_job_steps
             where user_id = $1 and job_id = $2 and status = 'confirmed'
           ),
           active_note_id = $3::uuid,
           active_commitment_hex = coalesce($4, active_commitment_hex),
           active_amount_units = coalesce($5, active_amount_units),
           active_leaf_index = $6,
           error_class = case
             when (select count(*) from spend_job_steps where user_id = $1 and job_id = $2 and status = 'confirmed') = total_recipients then null
             else error_class
           end,
           error_message = case
             when (select count(*) from spend_job_steps where user_id = $1 and job_id = $2 and status = 'confirmed') = total_recipients then null
             else error_message
           end,
           retry_after = null,
           lease_owner = null,
           lease_expires_at = null,
           last_heartbeat_at = null,
           execution_package_ciphertext = case
             when (select count(*) from spend_job_steps where user_id = $1 and job_id = $2 and status = 'confirmed') = total_recipients then null
             else execution_package_ciphertext
           end,
           execution_package_deleted_at = case
             when (select count(*) from spend_job_steps where user_id = $1 and job_id = $2 and status = 'confirmed') = total_recipients then coalesce(execution_package_deleted_at, now())
             else execution_package_deleted_at
           end,
           updated_at = now()
         where user_id = $1 and id = $2`,
        [
          input.userId,
          input.jobId,
          changeNoteId,
          input.changeNote?.commitmentHex ?? null,
          input.changeNote?.amountUnits ?? null,
          input.changeNote?.leafIndex ?? null,
        ],
      ),
      "Spend job could not be updated",
    );

    const completedTxHash = input.changeNote?.txHash ?? input.recipientNote?.txHash ?? null;
    await client.query(
      `with paid_request as (
         update requests r set
           status = 'paid',
           paid_spend_job_id = $2::uuid,
           updated_at = now()
         where r.id = (
           select request_id
           from spend_jobs
           where user_id = $1 and id = $2 and status = 'completed'
         )
           and r.payer_user_id = $1::uuid
           and r.status = 'open'
         returning r.*
       )
       insert into activity_events (
         user_id,
         spend_job_id,
         request_id,
         event_type,
         event_data,
         tx_hash
       )
       select
         requester_user_id,
         $2::uuid,
         id,
         'payment_request_paid',
         jsonb_build_object('spendJobId', $2::text),
         $3
       from paid_request`,
      [input.userId, input.jobId, completedTxHash],
    );

    await appendSpendJobEvent(client, {
      userId: input.userId,
      jobId: input.jobId,
      eventType: input.isFinalStep ? "spend_job_completed" : "spend_job_step_confirmed",
      eventData: {
        stepId: input.stepId,
        changeCommitmentHex: input.changeNote?.commitmentHex ?? null,
      },
      txHash: input.changeNote?.txHash ?? null,
    });
  });
}
