import test from "node:test";
import assert from "node:assert/strict";

import {
  computeParimutuelPositionValue,
  computeParimutuelQuoteForNewStake,
} from "./marketQuoteCore";

test("quotes a new market stake from the post-bet pool state", () => {
  const quote = computeParimutuelQuoteForNewStake({
    stakeUnits: "100",
    outcome: "YES",
    yesTotalUnits: "200",
    noTotalUnits: "100",
  });

  assert.deepEqual(quote, {
    payoutUnits: "133",
    multipleBps: 13300,
    totalPoolUnits: "400",
    outcomePoolUnits: "300",
  });
});

test("quotes the first stake on an empty side instead of hiding payout", () => {
  const quote = computeParimutuelQuoteForNewStake({
    stakeUnits: "100",
    outcome: "YES",
    yesTotalUnits: "0",
    noTotalUnits: "250",
  });

  assert.deepEqual(quote, {
    payoutUnits: "350",
    multipleBps: 35000,
    totalPoolUnits: "350",
    outcomePoolUnits: "100",
  });
});

test("values an existing position from current confirmed pool totals", () => {
  assert.deepEqual(
    computeParimutuelPositionValue({
      stakeUnits: "50",
      outcome: "NO",
      yesTotalUnits: "200",
      noTotalUnits: "100",
    }),
    {
      payoutUnits: "150",
      multipleBps: 30000,
      totalPoolUnits: "300",
      outcomePoolUnits: "100",
    },
  );
});

