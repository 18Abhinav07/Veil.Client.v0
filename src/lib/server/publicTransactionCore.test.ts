import test from "node:test";
import assert from "node:assert/strict";

import {
  assertXlmSpendable,
  xlmSpendableUnits,
} from "./publicTransactionCore";

test("XLM send preflight leaves Stellar reserve and fee in the source account", () => {
  assert.equal(
    xlmSpendableUnits({
      xlmBalance: "10000.0000000",
      baseReserveStroops: 5000000,
      subentryCount: 1,
      feeStroops: 100,
    }),
    "99984999900",
  );

  assert.doesNotThrow(() =>
    assertXlmSpendable({
      xlmBalance: "10000.0000000",
      amount: "9998.4999000",
      baseReserveStroops: 5000000,
      subentryCount: 1,
      feeStroops: 100,
    }),
  );
  assert.throws(
    () =>
      assertXlmSpendable({
        xlmBalance: "10000.0000000",
        amount: "9998.5000000",
        baseReserveStroops: 5000000,
        subentryCount: 1,
        feeStroops: 100,
      }),
    /XLM amount exceeds spendable balance/,
  );
});

test("XLM send preflight accounts for sponsored reserve entries", () => {
  assert.equal(
    xlmSpendableUnits({
      xlmBalance: "5.0000000",
      baseReserveStroops: 5000000,
      subentryCount: 2,
      numSponsoring: 1,
      numSponsored: 1,
    }),
    "30000000",
  );
});
