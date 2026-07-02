import test from "node:test";
import assert from "node:assert/strict";

import { buildInitialMarketSeeds } from "./marketSeeds";

test("initial market seeds mimic liquid yes/no formats without exposing demo markets by default", () => {
  const seededAt = new Date("2026-06-30T12:00:00.000Z");
  const seeds = buildInitialMarketSeeds({ seededAt });

  assert.equal(seeds.length, 13);
  assert.deepEqual(
    seeds.map((seed) => seed.slug),
    [
      "btc-higher-after-21d",
      "eth-higher-after-21d",
      "xlm-higher-after-14d",
      "sp500-higher-after-21d",
      "nvidia-higher-after-14d",
      "sol-higher-after-21d",
      "nasdaq100-higher-after-21d",
      "gold-higher-after-21d",
      "brent-oil-higher-after-21d",
      "us10y-yield-higher-after-21d",
      "tesla-higher-after-21d",
      "apple-higher-after-21d",
      "fed-target-unchanged-next-30d",
    ],
  );
  assert.equal(seeds.some((seed) => seed.demoOnly || seed.category === "Demo"), false);

  for (const seed of seeds) {
    assert.equal(seed.outcomes.length, 2);
    assert.deepEqual(seed.outcomes, ["YES", "NO"]);
    assert.ok(seed.resolutionSource.length > 8);
    assert.ok(seed.rules.length > 24);
    const daysOpen =
      (new Date(seed.closesAt).getTime() - seededAt.getTime()) / (24 * 60 * 60 * 1000);
    assert.ok(daysOpen >= 14, `${seed.slug} should stay open at least 14 days`);
    assert.ok(daysOpen <= 30, `${seed.slug} should stay open at most 30 days`);
  }
});

test("smoke-only seeds can opt into the demo settlement market", () => {
  const seeds = buildInitialMarketSeeds({
    seededAt: new Date("2026-06-30T12:00:00.000Z"),
    includeDemo: true,
  });

  assert.equal(seeds.length, 14);
  assert.equal(seeds.some((seed) => seed.slug === "demo-settlement-yes" && seed.demoOnly), true);
});
