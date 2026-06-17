import test from "node:test";
import assert from "node:assert/strict";
import type { RelayBody, WithdrawResponse } from "@/types";
import {
  BulkWithdrawExecutionError,
  executeBulkWithdraw,
  isTransientProverLag,
  isTransientRelayLag,
} from "./bulkWithdraw";

const relayBody = (label: string): RelayBody => ({
  poolId: "pool",
  proofUncompressedHex: `proof-${label}`,
  extData: {
    recipient: "recipient",
    extAmount: -1,
    encryptedOutput0: [],
    encryptedOutput1: [],
  },
  public: {
    root: `root-${label}`,
    inputNullifiers: [],
    outputCommitment0: `out0-${label}`,
    outputCommitment1: `out1-${label}`,
    publicAmount: "0",
    extDataHashBe: [],
    aspMembershipRoot: "asp",
    aspNonMembershipRoot: "non-asp",
  },
});

const withdrawResponse = (
  label: string,
  changeAmountUnits: string,
): WithdrawResponse => ({
  changeNoteBlindingHex: `change-blinding-${label}`,
  changeNoteCommitmentHex: `change-commitment-${label}`,
  changeAmountUnits,
  nextDummyBlindingHex: `dummy-blinding-${label}`,
  nextDummyCommitmentHex: `dummy-commitment-${label}`,
  relayBody: relayBody(label),
});

const productionMaterial = {
  notePrivateKeyHex: "11".repeat(32),
  senderEncryptionPublicHex: "22".repeat(32),
  membershipBlindingHex: "33".repeat(32),
};

test("classifies known prover and relayer lag as retryable", () => {
  assert.equal(isTransientProverLag(422, "leaf index out of range"), true);
  assert.equal(isTransientProverLag(422, "note has not been indexed yet"), true);
  assert.equal(isTransientProverLag(422, '{"error":"contracts_data_for_pool"}'), true);
  assert.equal(isTransientProverLag(422, '{"error":"asp_state"}'), true);
  assert.equal(isTransientProverLag(500, "leaf index out of range"), false);

  assert.equal(isTransientRelayLag(422, "SIMULATION_REJECTED: unknown root"), true);
  assert.equal(isTransientRelayLag(422, "Error(Contract, #0) verify failed"), true);
  assert.equal(
    isTransientRelayLag(422, "SIMULATION_REJECTED: Error(Contract, #9)"),
    false,
  );
  assert.equal(isTransientRelayLag(400, "unknown root"), false);
});

test("threads each confirmed change note into the next Lane 1 withdraw step", async () => {
  const proveBodies: unknown[] = [];
  const steps = await executeBulkWithdraw(
    {
      ...productionMaterial,
      noteBlindingHex: "initial-blinding",
      noteAmountUnits: "3000000000",
      noteLeafIndex: 10,
      dummyBlindingHex: "initial-dummy",
      poolId: "pool",
      recipients: [
        { address: "GRECIPIENT1", amountUnits: "1000000000" },
        { address: "GRECIPIENT2", amountUnits: "1000000000" },
      ],
    },
    {
      proveWithdraw: async (body) => {
        proveBodies.push(body);
        return proveBodies.length === 1
          ? withdrawResponse("one", "2000000000")
          : withdrawResponse("two", "1000000000");
      },
      relay: async (body) => ({ txHash: `tx-${body.proofUncompressedHex}` }),
      waitForTransaction: async () => 99,
      findNoteLeafIndex: async (commitment) =>
        commitment === "change-commitment-one" ? 12 : 14,
    },
  );

  assert.equal(steps.length, 2);
  assert.deepEqual(proveBodies[0], {
    ...productionMaterial,
    noteBlindingHex: "initial-blinding",
    noteAmountUnits: "3000000000",
    noteLeafIndex: 10,
    dummyBlindingHex: "initial-dummy",
    withdrawAmountUnits: "1000000000",
    recipientStellarAddress: "GRECIPIENT1",
    poolId: "pool",
  });
  assert.deepEqual(proveBodies[1], {
    ...productionMaterial,
    noteBlindingHex: "change-blinding-one",
    noteAmountUnits: "2000000000",
    noteLeafIndex: 12,
    dummyBlindingHex: "dummy-blinding-one",
    withdrawAmountUnits: "1000000000",
    recipientStellarAddress: "GRECIPIENT2",
    poolId: "pool",
  });
  assert.equal(steps[0].changeLeaf, 12);
  assert.equal(steps[1].changeLeaf, 14);
});

test("preserves confirmed steps when a later Lane 1 withdraw step fails", async () => {
  const error = await executeBulkWithdraw(
    {
      ...productionMaterial,
      noteBlindingHex: "initial-blinding",
      noteAmountUnits: "3000000000",
      noteLeafIndex: 10,
      dummyBlindingHex: "initial-dummy",
      poolId: "pool",
      recipients: [
        { address: "GRECIPIENT1", amountUnits: "1000000000" },
        { address: "GRECIPIENT2", amountUnits: "1000000000" },
      ],
    },
    {
      proveWithdraw: async (body) => {
        const recipient = (body as { recipientStellarAddress: string })
          .recipientStellarAddress;
        if (recipient === "GRECIPIENT2") throw new Error("prover lag exhausted");
        return withdrawResponse("one", "2000000000");
      },
      relay: async () => ({ txHash: "tx-one" }),
      waitForTransaction: async () => 99,
      findNoteLeafIndex: async () => 12,
    },
  ).then(
    () => undefined,
    (err: unknown) => err,
  );

  assert.ok(error instanceof BulkWithdrawExecutionError);
  assert.equal(error.steps.length, 1);
  assert.equal(error.steps[0].txHash, "tx-one");
  assert.match(error.message, /prover lag exhausted/);
});
