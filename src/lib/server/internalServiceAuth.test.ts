import test from "node:test";
import assert from "node:assert/strict";

import {
  getInternalServiceHeaders,
  legacyProofRoutesEnabled,
  requireLegacyProofRouteAccess,
} from "./internalServiceAuth";

test("internal service headers attach a bearer token only when configured", () => {
  assert.deepEqual(getInternalServiceHeaders({}), {});
  assert.deepEqual(
    getInternalServiceHeaders({ INTERNAL_SERVICE_AUTH_TOKEN: " service-token " }),
    { Authorization: "Bearer service-token" },
  );
});

test("legacy proof routes are disabled unless explicitly enabled", () => {
  assert.equal(legacyProofRoutesEnabled({}), false);
  assert.equal(legacyProofRoutesEnabled({ ENABLE_LEGACY_PROOF_ROUTES: "false" }), false);
  assert.equal(legacyProofRoutesEnabled({ ENABLE_LEGACY_PROOF_ROUTES: "true" }), true);
});

test("legacy proof routes require the internal smoke token when enabled", () => {
  const env = {
    ENABLE_LEGACY_PROOF_ROUTES: "true",
    INTERNAL_SERVICE_AUTH_TOKEN: "smoke-secret",
  };
  assert.equal(requireLegacyProofRouteAccess(new Headers(), env).ok, false);
  assert.equal(
    requireLegacyProofRouteAccess(new Headers({ authorization: "Bearer wrong" }), env).ok,
    false,
  );
  assert.equal(
    requireLegacyProofRouteAccess(new Headers({ authorization: "Bearer smoke-secret" }), env).ok,
    true,
  );
});
