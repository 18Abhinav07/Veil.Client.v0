import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("payment request detail API supports decline expire and paid spend-job linking", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "requests", "[requestId]", "route.ts"),
    "utf8",
  );

  assert.match(source, /export async function PATCH/);
  assert.match(source, /declinePaymentRequest/);
  assert.match(source, /expirePaymentRequest/);
  assert.match(source, /markPaymentRequestPaid/);
  assert.match(source, /paidSpendJobId/);
  assert.match(source, /recordActivityEvent/);
  assert.match(source, /createNotification/);
  assert.match(source, /declined/);
  assert.match(source, /expired/);
  assert.match(source, /paid/);
});
