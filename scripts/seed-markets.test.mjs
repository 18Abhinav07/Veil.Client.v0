import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildMarketSeedRows, buildSeedMarketsSql } from "./seed-markets.mjs";

const root = process.cwd();

test("market seed script provides default market rows and idempotent SQL", () => {
  const rows = buildMarketSeedRows({ seededAt: new Date("2026-06-30T12:00:00.000Z") });
  const sql = buildSeedMarketsSql();
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const source = readFileSync(join(root, "scripts", "seed-markets.mjs"), "utf8");

  assert.ok(rows.length >= 13);
  assert.ok(rows.some((row) => row.slug === "btc-higher-after-21d"));
  assert.ok(rows.some((row) => row.slug === "sol-higher-after-21d"));
  assert.ok(rows.some((row) => row.slug === "fed-target-unchanged-next-30d"));
  for (const row of rows.filter((item) => !item.demoOnly)) {
    const daysOpen =
      (new Date(row.closesAt).getTime() - new Date("2026-06-30T12:00:00.000Z").getTime()) /
      (24 * 60 * 60 * 1000);
    assert.ok(daysOpen >= 14, `${row.slug} should stay open at least 14 days`);
    assert.ok(daysOpen <= 30, `${row.slug} should stay open at most 30 days`);
  }
  assert.match(sql, /insert into market_pools/i);
  assert.match(sql, /insert into prediction_markets/i);
  assert.match(sql, /on conflict \(slug\) do update/i);
  assert.equal(packageJson.scripts["db:seed:markets"], "node scripts/seed-markets.mjs");
  assert.match(source, /loadMarketSeedEnv/);
  assert.match(source, /backend.*\.env/);
  assert.match(source, /MARKET_POOL_CONTRACT_ID/);
});
