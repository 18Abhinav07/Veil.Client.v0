import { randomUUID } from "node:crypto";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import type { PrivateNoteSecrets } from "@/lib/noteCrypto";
import { createAuthOptions } from "@/lib/server/auth";
import {
  encryptBackgroundExecutionPackage,
  readBackgroundExecutionKey,
  type BackgroundSpendExecutionPackage,
} from "@/lib/server/backgroundExecutionPackage";
import { getPgPool } from "@/lib/server/db";
import {
  createSpendJob,
  listSpendJobs,
  type SpendJobRecipientInput,
} from "@/lib/server/walletRepository";
import { serializeSpendJobDetail } from "@/lib/server/spendJobSerialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_INTERACTIVE_RECIPIENTS = 5;

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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPositiveIntegerString(value: string) {
  return /^[1-9][0-9]*$/.test(value);
}

function readHex32(value: unknown, label: string): string {
  const text = readString(value).replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return text.toLowerCase();
}

function readRecipients(value: unknown): SpendJobRecipientInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    address: readString((item as { address?: unknown }).address),
    amountUnits: readString((item as { amountUnits?: unknown }).amountUnits),
    recipientUserId: readString((item as { recipientUserId?: unknown }).recipientUserId) || null,
    recipientHandle: readString((item as { recipientHandle?: unknown }).recipientHandle) || null,
    recipientNotePublicHex:
      readString((item as { recipientNotePublicHex?: unknown }).recipientNotePublicHex) || null,
    recipientX25519PublicHex:
      readString((item as { recipientX25519PublicHex?: unknown }).recipientX25519PublicHex) ||
      null,
  }));
}

function readBackgroundActiveNote(value: unknown): PrivateNoteSecrets {
  if (!value || typeof value !== "object") {
    throw new Error("Background execution package is missing the active note");
  }
  const note = value as Record<string, unknown>;
  const leafIndex = note.leafIndex;
  if (typeof leafIndex !== "number" || !Number.isFinite(leafIndex)) {
    throw new Error("Background execution package active note leaf index is invalid");
  }
  const createdAt = typeof note.createdAt === "number" ? note.createdAt : Date.now();
  return {
    blindingHex: readString(note.blindingHex),
    commitmentHex: readString(note.commitmentHex),
    amountUnits: readString(note.amountUnits),
    leafIndex,
    dummyBlindingHex: readString(note.dummyBlindingHex),
    dummyCommitmentHex: readString(note.dummyCommitmentHex),
    createdAt,
  };
}

async function buildEncryptedExecutionPackage(input: {
  payload: Record<string, unknown>;
  userId: string;
  jobId: string;
  kind: "lane1_withdraw" | "lane2_transfer";
  expiresAt: Date;
  sourceCommitmentHex: string;
  sourceAmountUnits: string;
  sourceLeafIndex: number | null;
}): Promise<string> {
  const rawPackage = input.payload.executionPackage;
  if (!rawPackage || typeof rawPackage !== "object") {
    throw new Error("Send the batch to worker for async execution in an encrypted package before starting more than five recipients.");
  }
  const packageInput = rawPackage as Record<string, unknown>;
  const activeNote = readBackgroundActiveNote(packageInput.activeNote);
  if (
    activeNote.commitmentHex !== input.sourceCommitmentHex ||
    activeNote.amountUnits !== input.sourceAmountUnits ||
    activeNote.leafIndex !== input.sourceLeafIndex
  ) {
    throw new Error("Background execution package does not match the selected private note");
  }

  const executionPackage: BackgroundSpendExecutionPackage = {
    version: 1,
    userId: input.userId,
    jobId: input.jobId,
    kind: input.kind,
    expiresAt: input.expiresAt.toISOString(),
    notePrivateKeyHex: readHex32(packageInput.notePrivateKeyHex, "notePrivateKeyHex"),
    senderEncryptionPublicHex: readHex32(
      packageInput.senderEncryptionPublicHex,
      "senderEncryptionPublicHex",
    ),
    membershipBlindingHex: readHex32(
      packageInput.membershipBlindingHex,
      "membershipBlindingHex",
    ),
    activeNote,
  };

  const key = readBackgroundExecutionKey({
    JOB_EXECUTION_ENCRYPTION_KEY: process.env.JOB_EXECUTION_ENCRYPTION_KEY,
  });
  return JSON.stringify(await encryptBackgroundExecutionPackage(executionPackage, { key }));
}

export async function GET() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const jobs = await listSpendJobs(getPgPool(), { userId: auth.userId });
  return NextResponse.json({ jobs: jobs.map(serializeSpendJobDetail) });
}

export async function POST(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipients = readRecipients(payload.recipients);
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Add at least one recipient" }, { status: 400 });
  }
  if (recipients.some((recipient) => !recipient.address || !recipient.amountUnits)) {
    return NextResponse.json(
      { error: "Every recipient needs an address and amount" },
      { status: 400 },
    );
  }
  if (recipients.some((recipient) => !isPositiveIntegerString(recipient.amountUnits))) {
    return NextResponse.json(
      { error: "Every recipient amount must be a positive integer unit value" },
      { status: 400 },
    );
  }

  const sourceNoteId = readString(payload.sourceNoteId);
  const sourceCommitmentHex = readString(payload.sourceCommitmentHex);
  const sourceAmountUnits = readString(payload.sourceAmountUnits);
  const poolId = readString(payload.poolId);
  const idempotencyKey = readString(payload.idempotencyKey);
  const requestId = readString(payload.requestId) || null;
  const kind =
    readString(payload.kind) === "lane2_transfer" ? "lane2_transfer" : "lane1_withdraw";
  const sourceLeafIndex =
    typeof payload.sourceLeafIndex === "number" ? payload.sourceLeafIndex : null;

  if (!sourceNoteId || !sourceCommitmentHex || !sourceAmountUnits || !poolId) {
    return NextResponse.json({ error: "Missing source note details" }, { status: 400 });
  }
  if (!isPositiveIntegerString(sourceAmountUnits)) {
    return NextResponse.json(
      { error: "Source note amount must be a positive integer unit value" },
      { status: 400 },
    );
  }
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Missing idempotency key" }, { status: 400 });
  }

  const totalAmountUnits = recipients
    .reduce((total, recipient) => total + BigInt(recipient.amountUnits), BigInt(0))
    .toString();
  if (BigInt(totalAmountUnits) > BigInt(sourceAmountUnits)) {
    return NextResponse.json(
      { error: "Amount exceeds the selected private note balance" },
      { status: 400 },
    );
  }
  if (
    kind === "lane2_transfer" &&
    recipients.some(
      (recipient) =>
        !recipient.recipientUserId ||
        !recipient.recipientNotePublicHex ||
        !recipient.recipientX25519PublicHex,
    )
  ) {
    return NextResponse.json(
      { error: "Private recipients must include registered public wallet keys" },
      { status: 400 },
    );
  }

  const backgroundConsent = payload.backgroundConsent === true;
  const executionPackageExpiresAtRaw = readString(payload.executionPackageExpiresAt);
  let executionPackageExpiresAt: Date | null = null;
  if (executionPackageExpiresAtRaw) {
    const parsed = new Date(executionPackageExpiresAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Background execution package expiry is invalid" },
        { status: 400 },
      );
    }
    executionPackageExpiresAt = parsed;
  }
  const useBackgroundWorker = recipients.length > MAX_INTERACTIVE_RECIPIENTS;
  const backgroundJobId = useBackgroundWorker ? randomUUID() : null;
  let executionPackageCiphertext: string | null = null;
  if (useBackgroundWorker) {
    if (!backgroundConsent) {
      return NextResponse.json(
        {
          error:
            "Send the batch to worker for async execution in an encrypted package before starting more than five recipients.",
        },
        { status: 400 },
      );
    }
    if (!executionPackageExpiresAt) {
      executionPackageExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    }
    try {
      executionPackageCiphertext = await buildEncryptedExecutionPackage({
        payload,
        userId: auth.userId,
        jobId: backgroundJobId!,
        kind,
        expiresAt: executionPackageExpiresAt,
        sourceCommitmentHex,
        sourceAmountUnits,
        sourceLeafIndex,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }
  }

  try {
    const detail = await createSpendJob(getPgPool(), {
      jobId: backgroundJobId,
      kind,
      userId: auth.userId,
      requestId,
      idempotencyKey,
      sourceNoteId,
      sourceCommitmentHex,
      sourceAmountUnits,
      sourceLeafIndex,
      poolId,
      totalAmountUnits,
      recipients,
      executionMode:
        useBackgroundWorker ? "background" : "interactive",
      executionPackageCiphertext:
        useBackgroundWorker ? executionPackageCiphertext : null,
      executionPackageExpiresAt,
    });
    return NextResponse.json({ job: serializeSpendJobDetail(detail) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
