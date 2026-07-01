import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet notifications API lists unread notifications and marks them read", () => {
  const routePath = join(root, "src", "app", "api", "wallet", "notifications", "route.ts");
  assert.equal(existsSync(routePath), true);
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function GET/);
  assert.match(source, /export async function PATCH/);
  assert.match(source, /getServerSession/);
  assert.match(source, /listNotifications/);
  assert.match(source, /markNotificationsRead/);
  assert.match(source, /unreadOnly/);
  assert.match(source, /notificationIds/);
});
