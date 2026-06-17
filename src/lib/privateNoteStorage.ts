export type EncryptedNoteStatus =
  | "unspent"
  | "spent"
  | "pending_deposit"
  | "pending_spend"
  | "received"
  | "failed_recovery";

export type EncryptedNoteSource = "deposit" | "change" | "received";

export interface EncryptedNoteStoragePayload {
  commitmentHex: string;
  encryptedNoteCiphertext: string;
  amountUnits: string;
  status: EncryptedNoteStatus;
  source: EncryptedNoteSource;
  assetCode?: string;
  leafIndex?: number | null;
  txHash?: string | null;
}

const forbiddenNoteFields = [
  "stellarSecretKey",
  "noteBlindingHex",
  "blindingHex",
  "dummyBlindingHex",
  "dummyCommitmentHex",
  "bn254NoteSecretHex",
  "x25519PrivateJwk",
];

function readNonEmptyString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Encrypted note payload requires ${key}`);
  }
  return value;
}

export function assertEncryptedNotePayload(
  payload: unknown,
): asserts payload is EncryptedNoteStoragePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Encrypted note payload must be an object");
  }
  const record = payload as Record<string, unknown>;
  for (const field of forbiddenNoteFields) {
    if (field in record) {
      throw new Error(`Encrypted note payload must not include ${field}`);
    }
  }

  readNonEmptyString(record, "commitmentHex");
  readNonEmptyString(record, "encryptedNoteCiphertext");
  readNonEmptyString(record, "amountUnits");

  if (
    ![
      "unspent",
      "spent",
      "pending_deposit",
      "pending_spend",
      "received",
      "failed_recovery",
    ].includes(String(record.status))
  ) {
    throw new Error("Encrypted note payload has an invalid status");
  }
  if (!["deposit", "change", "received"].includes(String(record.source))) {
    throw new Error("Encrypted note payload has an invalid source");
  }
  if (
    record.leafIndex !== undefined &&
    record.leafIndex !== null &&
    !Number.isInteger(record.leafIndex)
  ) {
    throw new Error("Encrypted note payload leafIndex must be an integer");
  }
}
