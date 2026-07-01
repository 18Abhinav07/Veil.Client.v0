import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("internal spend worker tick route is service-auth gated and advances one background step", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "internal", "spend-worker", "tick", "route.ts"),
    "utf8",
  );

  assert.match(source, /requireInternalServiceAccess/);
  assert.match(source, /advanceOneBackgroundSpendStep/);
  assert.match(source, /JOB_EXECUTION_ENCRYPTION_KEY/);
  assert.match(source, /leaseOwner/);
  assert.doesNotMatch(source, /getServerSession/);
});
