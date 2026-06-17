import type { BulkWithdrawStep, RelayBody, WithdrawResponse } from "@/types";

export interface IncomingRecipient {
  address: string;
  amountUnits: string;
}

export interface BulkWithdrawBody {
  notePrivateKeyHex: string;
  senderEncryptionPublicHex: string;
  membershipBlindingHex: string;
  noteBlindingHex: string;
  noteAmountUnits: string;
  noteLeafIndex: number;
  dummyBlindingHex: string;
  recipients: IncomingRecipient[];
  poolId: string;
}

export interface BulkWithdrawDependencies {
  proveWithdraw: (body: unknown) => Promise<WithdrawResponse>;
  relay: (relayBody: RelayBody) => Promise<{ txHash: string }>;
  waitForTransaction: (txHash: string) => Promise<number>;
  findNoteLeafIndex: (commitmentHex: string, minedLedger: number) => Promise<number>;
}

export class BulkWithdrawExecutionError extends Error {
  readonly steps: BulkWithdrawStep[];

  constructor(error: unknown, steps: BulkWithdrawStep[]) {
    super(String(error));
    this.name = "BulkWithdrawExecutionError";
    this.steps = steps;
  }
}

export function isTransientProverLag(status: number, body: string): boolean {
  return (
    status === 422 &&
    /out of range|not been indexed|only has \d+ commitments|indexed yet|contracts_data_for_pool|asp_state/i.test(
      body,
    )
  );
}

export function isTransientRelayLag(status: number, body: string): boolean {
  if (/Error\(Contract,\s*#9\)|AlreadySpentNullifier|already spent|nullifier/i.test(body)) {
    return false;
  }
  return (
    status === 422 &&
    /SIMULATION_REJECTED|Error\(Contract, #0\)|verify|unknown root|invalid root|root/i.test(
      body,
    )
  );
}

export async function executeBulkWithdraw(
  body: BulkWithdrawBody,
  deps: BulkWithdrawDependencies,
): Promise<BulkWithdrawStep[]> {
  let currentBlinding = body.noteBlindingHex;
  let currentAmount = body.noteAmountUnits;
  let currentLeaf = body.noteLeafIndex;
  let currentDummyBlinding = body.dummyBlindingHex;

  const steps: BulkWithdrawStep[] = [];

  try {
    for (const rec of body.recipients) {
      const result = await deps.proveWithdraw({
        notePrivateKeyHex: body.notePrivateKeyHex,
        senderEncryptionPublicHex: body.senderEncryptionPublicHex,
        membershipBlindingHex: body.membershipBlindingHex,
        noteBlindingHex: currentBlinding,
        noteAmountUnits: currentAmount,
        noteLeafIndex: currentLeaf,
        dummyBlindingHex: currentDummyBlinding,
        withdrawAmountUnits: rec.amountUnits,
        recipientStellarAddress: rec.address,
        poolId: body.poolId,
      });

      const { txHash } = await deps.relay(result.relayBody);

      const changeAmount = result.changeAmountUnits;
      let changeLeaf = currentLeaf + 2;
      if (BigInt(changeAmount) > BigInt(0)) {
        const minedLedger = await deps.waitForTransaction(txHash);
        changeLeaf = await deps.findNoteLeafIndex(
          result.changeNoteCommitmentHex,
          minedLedger,
        );
      }

      steps.push({
        recipient: rec.address,
        amountUnits: rec.amountUnits,
        txHash,
        changeAmountUnits: changeAmount,
        changeNoteCommitmentHex: result.changeNoteCommitmentHex,
        changeNoteBlindingHex: result.changeNoteBlindingHex,
        nextDummyBlindingHex: result.nextDummyBlindingHex,
        nextDummyCommitmentHex: result.nextDummyCommitmentHex,
        changeLeaf,
      });

      currentBlinding = result.changeNoteBlindingHex;
      currentAmount = changeAmount;
      currentLeaf = changeLeaf;
      currentDummyBlinding = result.nextDummyBlindingHex;
    }
  } catch (error) {
    throw new BulkWithdrawExecutionError(error, steps);
  }

  return steps;
}
