import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MARKET_ADMIN_EMAIL,
  assertMarketAdminEmail,
  isMarketAdminEmail,
} from "./marketAuth";

test("market admin auth only accepts Abhinav's verified Google account", () => {
  assert.equal(DEFAULT_MARKET_ADMIN_EMAIL, "abhinavpangaria2003@gmail.com");
  assert.equal(isMarketAdminEmail(" abhinavpangaria2003@gmail.com "), true);
  assert.equal(isMarketAdminEmail("ABHINAVPANGARIA2003@GMAIL.COM"), true);
  assert.equal(isMarketAdminEmail("someone@example.com"), false);
  assert.equal(isMarketAdminEmail(null), false);
});

test("market admin assertion throws a 403-shaped error for every other email", () => {
  assert.doesNotThrow(() => assertMarketAdminEmail("abhinavpangaria2003@gmail.com"));
  assert.throws(() => assertMarketAdminEmail("other@example.com"), /403/);
});
