import test from "node:test";
import assert from "node:assert/strict";

import {
  computeMarketOdds,
  computeParimutuelPayout,
  computeSettlementPayouts,
} from "./marketMath";

test("computes pari-mutuel payouts with integer floor rounding", () => {
  assert.equal(
    computeParimutuelPayout({
      userWinningStake: BigInt("50000000"),
      totalPool: BigInt("340000000"),
      winningPool: BigInt("200000000"),
    }),
    BigInt("85000000"),
  );
});

test("blocks normal payout math when no winning stake exists", () => {
  assert.throws(
    () =>
      computeParimutuelPayout({
        userWinningStake: BigInt("1"),
        totalPool: BigInt("10"),
        winningPool: BigInt("0"),
      }),
    /winning pool is empty/i,
  );
});

test("aggregates winning bets per user and leaves rounding dust explicit", () => {
  const settlement = computeSettlementPayouts({
    winningOutcome: "YES",
    bets: [
      { userId: "alice", outcome: "YES", amountUnits: "100" },
      { userId: "alice", outcome: "YES", amountUnits: "50" },
      { userId: "bob", outcome: "YES", amountUnits: "50" },
      { userId: "chris", outcome: "NO", amountUnits: "101" },
    ],
  });

  assert.deepEqual(settlement.payouts, [
    { userId: "alice", amountUnits: "225" },
    { userId: "bob", amountUnits: "75" },
  ]);
  assert.equal(settlement.roundingDustUnits, "1");
});

test("computes implied odds from confirmed totals only", () => {
  assert.deepEqual(
    computeMarketOdds({ yesTotal: "200", noTotal: "100" }),
    {
      yesProbabilityBps: 6667,
      noProbabilityBps: 3333,
      yesMultipleBps: 15000,
      noMultipleBps: 30000,
    },
  );
  assert.deepEqual(
    computeMarketOdds({ yesTotal: "0", noTotal: "0" }),
    {
      yesProbabilityBps: 5000,
      noProbabilityBps: 5000,
      yesMultipleBps: null,
      noMultipleBps: null,
    },
  );
});
