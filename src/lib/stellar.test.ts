import test from "node:test";
import assert from "node:assert/strict";
import {
  getPoolEventConfig,
  isRetryableEventRangeError,
  parseEventLedgerRange,
} from "./stellar";

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
