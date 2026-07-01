import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { parseHorizonAccount, USDC_CODE, USDC_ISSUER } from "@/lib/publicWalletCore";
import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { serializeSpendJobDetail } from "@/lib/server/spendJobSerialization";
import {
  getEncryptedNotesForUser,
  getWalletBadgeCounts,
  listNotifications,
  listPaymentRequests,
  listPublicTransactions,
  listSpendJobs,
  listWalletContacts,
  type ContactViewRow,
  type NotificationRow,
  type PaymentRequestViewRow,
  type PublicTransactionRow,
} from "@/lib/server/walletRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HORIZON_URL = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

interface HorizonTradeAggregation {
  timestamp: number;
  close: string;
}

async function requireUserId() {
  const session = await getServerSession(createAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { error: null, userId };
}

function serializeContact(row: ContactViewRow) {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    contactUserId: row.contact_user_id,
    status: row.status,
    direction: row.direction,
    otherUserId: row.other_user_id,
    otherEmail: row.other_email,
    otherHandle: row.other_handle,
    otherStellarPublicKey: row.other_stellar_public_key,
    otherRegisteredInPool: row.other_registered_in_pool,
    otherBn254PublicHex: row.other_bn254_public_hex,
    otherX25519PublicHex: row.other_x25519_public_hex,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRequest(row: PaymentRequestViewRow) {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    payerUserId: row.payer_user_id,
    payerEmail: row.payer_email,
    amountUnits: row.amount_units,
    assetCode: row.asset_code,
    memoCiphertext: row.memo_ciphertext,
    status: row.status,
    paidSpendJobId: row.paid_spend_job_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    direction: row.direction,
    requesterEmail: row.requester_email,
    requesterHandle: row.requester_handle,
    requesterStellarPublicKey: row.requester_stellar_public_key,
    requesterBn254PublicHex: row.requester_bn254_public_hex,
    requesterX25519PublicHex: row.requester_x25519_public_hex,
    payerHandle: row.payer_handle,
  };
}

function serializePublicTransaction(row: PublicTransactionRow) {
  return {
    id: row.id,
    sourcePublicKey: row.source_public_key,
    destinationPublicKey: row.destination_public_key,
    kind: row.kind,
    assetCode: row.asset_code,
    amountUnits: row.amount_units,
    txHash: row.tx_hash,
    ledger: row.ledger,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeNotification(row: NotificationRow) {
  return {
    id: row.id,
    activityEventId: row.activity_event_id,
    type: row.type,
    severity: row.severity,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    title: row.title,
    body: row.body,
    actionUrl: row.action_url,
    readAt: row.read_at,
    seenAt: row.seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeNote(note: Awaited<ReturnType<typeof getEncryptedNotesForUser>>[number]) {
  return {
    id: note.id,
    commitmentHex: note.commitment_hex,
    encryptedNoteCiphertext: note.encrypted_note_ciphertext,
    assetCode: note.asset_code,
    amountUnits: note.amount_units,
    leafIndex: note.leaf_index,
    status: note.status,
    source: note.source,
    txHash: note.tx_hash,
    activeJobId: note.active_job_id ?? null,
    spendVersion: note.spend_version ?? 0,
    lastChainCheckedAt: note.last_chain_checked_at ?? null,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };
}

async function loadPublicWalletState(address: string) {
  let response: Response;
  try {
    response = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(address)}`, {
      cache: "no-store",
    });
  } catch (err) {
    console.warn("Public wallet Horizon lookup failed", err);
    return parseHorizonAccount(null);
  }
  if (response.status === 404) return parseHorizonAccount(null);
  if (!response.ok) {
    throw new Error(`Failed to load Stellar account: HTTP ${response.status}`);
  }
  return parseHorizonAccount(await response.json());
}

function readPrice(value: string): number | null {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchMarketState() {
  const endTime = Date.now();
  const startTime = endTime - 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    base_asset_type: "native",
    counter_asset_type: "credit_alphanum4",
    counter_asset_code: USDC_CODE,
    counter_asset_issuer: USDC_ISSUER,
    start_time: String(startTime),
    end_time: String(endTime),
    resolution: String(FIFTEEN_MINUTES_MS),
    order: "desc",
    limit: "48",
  });

  const response = await fetch(`${HORIZON_URL}/trade_aggregations?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    _embedded?: { records?: HorizonTradeAggregation[] };
  };

  let realPrice = 0.172;
  try {
    const cgRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd",
      { next: { revalidate: 60 } },
    );
    if (cgRes.ok) {
      const cgData = (await cgRes.json()) as { stellar?: { usd?: number } };
      if (cgData.stellar?.usd) realPrice = cgData.stellar.usd;
    }
  } catch {
    // Market data is non-critical during wallet bootstrap.
  }

  const rawPoints = (data._embedded?.records ?? [])
    .map((record) => ({
      time: new Date(Number(record.timestamp)).toISOString(),
      price: readPrice(record.close),
    }))
    .filter((point): point is { time: string; price: number } => point.price !== null)
    .reverse();
  const testnetLatest = rawPoints.at(-1)?.price ?? 1;
  const scaleFactor = realPrice / testnetLatest;
  const points = rawPoints.map((point) => ({
    time: point.time,
    price: point.price * scaleFactor,
  }));
  const latest = points.at(-1)?.price ?? realPrice;
  const previous = points.at(-2)?.price ?? latest;
  const changePct = previous > 0 ? ((latest - previous) / previous) * 100 : null;

  return {
    pair: "XLM/USDC",
    source: "Stellar Horizon (Scaled to CoinGecko)",
    latest,
    changePct,
    points,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const db = getPgPool();
  const [
    notes,
    contacts,
    requests,
    spendJobs,
    publicTransactions,
    notifications,
    badges,
    publicAccount,
    publicMarket,
  ] = await Promise.all([
    getEncryptedNotesForUser(db, { userId }),
    listWalletContacts(db, { userId }),
    listPaymentRequests(db, { userId }),
    listSpendJobs(db, { userId }),
    listPublicTransactions(db, { userId }),
    listNotifications(db, { userId, unreadOnly: false, limit: 20 }),
    getWalletBadgeCounts(db, { userId }),
    loadPublicWalletState(address),
    fetchMarketState(),
  ]);

  return NextResponse.json({
    badges,
    publicAccount,
    publicMarket,
    notes: notes.map(serializeNote),
    contacts: contacts.map(serializeContact),
    requests: requests.map(serializeRequest),
    spendJobs: spendJobs.map(serializeSpendJobDetail),
    publicTransactions: publicTransactions.map(serializePublicTransaction),
    notifications: notifications.map(serializeNotification),
  });
}
