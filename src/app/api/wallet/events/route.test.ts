import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet events API streams general wallet activity over SSE", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "events", "route.ts"),
    "utf8",
  );

  assert.match(source, /text\/event-stream/);
  assert.match(source, /listWalletEvents/);
  assert.match(source, /getLatestWalletEventId/);
  assert.match(source, /if \(!lastEventId\)/);
  assert.match(source, /wallet_activity/);
  assert.match(source, /heartbeat/);
  assert.match(source, /last-event-id/);
  assert.match(source, /contact/);
  assert.match(source, /request/);
  assert.match(source, /spend_job/);
});
