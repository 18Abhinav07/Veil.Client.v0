export interface DepositResponse {
  noteBlindingHex: string;
  noteCommitmentHex: string;
  amountUnits: string;
  poolRootHex: string;
  proofHex: string;
  unsignedXdr: string;
  authEntries: string[];
  latestLedger: number;
  dummyBlindingHex: string;
  dummyCommitmentHex: string;
}

export interface WithdrawResponse {
  changeNoteBlindingHex: string;
  changeNoteCommitmentHex: string;
  changeAmountUnits: string;
  nextDummyBlindingHex: string;
  nextDummyCommitmentHex: string;
  relayBody: RelayBody;
}

export interface TransferResponse {
  recipientNoteBlindingHex: string;
  recipientNoteCommitmentHex: string;
  recipientAmountUnits: string;
  senderChangeBlindingHex: string;
  senderChangeCommitmentHex: string;
  senderChangeAmountUnits: string;
  relayBody: RelayBody;
}

export interface RelayBody {
  poolId: string;
  proofUncompressedHex: string;
  extData: {
    recipient: string;
    extAmount: number | string;
    encryptedOutput0: number[];
    encryptedOutput1: number[];
  };
  public: {
    root: string;
    inputNullifiers: string[];
    outputCommitment0: string;
    outputCommitment1: string;
    publicAmount: string;
    extDataHashBe: number[];
    aspMembershipRoot: string;
    aspNonMembershipRoot: string;
  };
}

export interface RelayResponse {
  txHash: string;
  status: string;
}

/** One confirmed payout returned by the server-side /api/bulk-withdraw chain. */
export interface BulkWithdrawStep {
  recipient: string;
  amountUnits: string;
  txHash: string;
  changeAmountUnits: string;
  changeNoteCommitmentHex: string;
  changeNoteBlindingHex: string;
  nextDummyBlindingHex: string;
  nextDummyCommitmentHex: string;
  changeLeaf: number;
}

export interface NoteState {
  /** Stable id for this note — the commitment hex doubles as the key. */
  id: string;
  blindingHex: string;
  commitmentHex: string;
  amountUnits: string;
  leafIndex?: number;
  dummyBlindingHex: string;
  dummyCommitmentHex: string;
  /** Creation timestamp (ms) for ordering the list. */
  createdAt: number;
  /** True once the note has been fully spent down to zero. */
  spent?: boolean;
}

export interface TxLogEntry {
  id: string;
  type: "deposit" | "withdraw" | "register";
  txHash?: string;
  status: "pending" | "success" | "error";
  message: string;
  timestamp: number;
}

export interface Recipient {
  address: string;
  amountUnits: string;
}
