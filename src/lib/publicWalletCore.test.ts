import test from "node:test";
import assert from "node:assert/strict";

import {
  decimalToStellarUnits,
  formatStellarUnits,
  parseHorizonAccount,
} from "./publicWalletCore";

test("public wallet core parses XLM and USDC balances plus trustline state", () => {
  const state = parseHorizonAccount({
    balances: [
      { asset_type: "native", balance: "123.4567000" },
      {
        asset_code: "USDC",
        asset_issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        balance: "7.2500000",
      },
    ],
  });

  assert.equal(state.exists, true);
  assert.equal(state.xlmUnits, "1234567000");
  assert.equal(state.usdcUnits, "72500000");
  assert.equal(state.hasUsdcTrustline, true);
});

test("public wallet core treats missing Horizon accounts as unfunded wallets", () => {
  const state = parseHorizonAccount(null);

  assert.equal(state.exists, false);
  assert.equal(state.xlmUnits, "0");
  assert.equal(state.usdcUnits, "0");
  assert.equal(state.hasUsdcTrustline, false);
});

test("public wallet core converts Stellar decimal amounts without floating point math", () => {
  assert.equal(decimalToStellarUnits("1"), "10000000");
  assert.equal(decimalToStellarUnits("0.0000001"), "1");
  assert.equal(decimalToStellarUnits("12.34000009"), "123400000");
  assert.equal(formatStellarUnits("123400000", "USDC"), "12.34 USDC");
  assert.throws(() => decimalToStellarUnits("0"), /greater than zero/);
  assert.throws(() => decimalToStellarUnits("abc"), /valid amount/);
});
