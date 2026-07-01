import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet badge API returns compact counts without loading every entity list", () => {
  const routePath = join(root, "src", "app", "api", "wallet", "badges", "route.ts");
  assert.equal(existsSync(routePath), true);
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function GET/);
  assert.match(source, /getServerSession/);
  assert.match(source, /getWalletBadgeCounts/);
  assert.match(source, /incomingContactRequests/);
  assert.match(source, /openPaymentRequests/);
  assert.match(source, /unreadNotifications/);
  assert.match(source, /recoverableJobs/);
  assert.doesNotMatch(source, /listWalletContacts/);
  assert.doesNotMatch(source, /listPaymentRequests/);
  assert.doesNotMatch(source, /listSpendJobs/);
});
