import test from "node:test";
import assert from "node:assert/strict";
import {
  findPoolCommitmentEventFromEvents,
  getPoolEventConfig,
  isRetryableEventRangeError,
  parseEventLedgerRange,
} from "./stellar";

function commitmentTopic(hex: string) {
  return Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from(hex, "hex")]).toString("base64");
}

function leafValue(index: number) {
  const value = Buffer.alloc(8);
  value.writeUInt32BE(index, 4);
  return value.toString("base64");
}

test("classifies Soroban RPC event range lag as retryable", () => {
  assert.equal(
    isRetryableEventRangeError(
      new Error("startLedger must be within the ledger range: 3207347 - 3328306"),
    ),
    true,
  );
  assert.equal(isRetryableEventRangeError(new Error("invalid contract id")), false);
});

test("parses Soroban RPC event ledger range errors", () => {
  assert.deepEqual(
    parseEventLedgerRange(
      new Error('{"code":-32600,"message":"startLedger must be within the ledger range: 3227390 - 3348349"}'),
    ),
    { oldest: 3227390, newest: 3348349 },
  );
  assert.equal(parseEventLedgerRange(new Error("invalid contract id")), null);
});

test("only retries event range errors when RPC event index is behind requested start", () => {
  const error = new Error(
    '{"code":-32600,"message":"startLedger must be within the ledger range: 3227390 - 3348349"}',
  );

  assert.equal(isRetryableEventRangeError(error, 3348350), true);
  assert.equal(isRetryableEventRangeError(error, 3227389), false);
});

test("resolves market pool event config without mutating wallet pool defaults", () => {
  assert.deepEqual(
    getPoolEventConfig({
      poolId: "CMARKETPOOL",
      deploymentLedger: 445566,
    }),
    {
      poolId: "CMARKETPOOL",
      deploymentLedger: 445566,
    },
  );
});

test("extracts leaf index and tx hash from successful pool commitment events", () => {
  const commitment = "a".repeat(64);
  const ignored = "b".repeat(64);

  assert.deepEqual(
    findPoolCommitmentEventFromEvents(
      [
        {
          topic: ["ignored", commitmentTopic(ignored)],
          value: leafValue(7),
          ledger: 3391000,
          txHash: "tx-ignored",
          inSuccessfulContractCall: true,
        },
        {
          topic: ["failed", commitmentTopic(commitment)],
          value: leafValue(8),
          ledger: 3391001,
          txHash: "tx-failed",
          inSuccessfulContractCall: false,
        },
        {
          topic: ["matched", commitmentTopic(commitment)],
          value: leafValue(9),
          ledger: 3391002,
          txHash: "tx-matched",
          inSuccessfulContractCall: true,
        },
      ],
      commitment,
    ),
    { leafIndex: 9, ledger: 3391002, txHash: "tx-matched" },
  );
});
