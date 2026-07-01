import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readRoute(...segments: string[]) {
  return readFileSync(join(root, "src", "app", "api", ...segments, "route.ts"), "utf8");
}

test("legacy proof proxy routes are disabled behind explicit smoke auth gates", () => {
  for (const source of [
    readRoute("prove-deposit"),
    readRoute("prove-withdraw"),
    readRoute("bulk-withdraw"),
  ]) {
    assert.match(source, /requireLegacyProofRouteAccess/);
    assert.match(source, /LEGACY_ROUTE_DISABLED/);
    assert.match(source, /SERVICE_AUTH_REQUIRED/);
  }
});

test("server routes attach internal service auth to prover and relayer calls", () => {
  const callers = [
    readRoute("wallet", "private", "deposit"),
    readRoute("wallet", "private", "spend-jobs", "[jobId]", "advance"),
    readRoute("wallet", "registration"),
    readRoute("wallet", "keys", "derive-note-public"),
    readRoute("wallet", "keys", "decrypt-output-note"),
    readRoute("bulk-withdraw"),
    readRoute("prove-deposit"),
    readRoute("prove-withdraw"),
  ];

  for (const source of callers) {
    assert.match(source, /getInternalServiceHeaders/);
  }
});
