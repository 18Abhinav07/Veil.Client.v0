import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("home page is the only stripped entry page and links to wallet sign in", () => {
  const source = readSource("src/app/page.tsx");

  assert.match(source, /Veil_Bg_Removed_Logo/);
  assert.match(source, /href="\/signin\?callbackUrl=\/wallet"/);
  assert.match(source, /Get started/);
  assert.doesNotMatch(source, /getServerSession/);
  assert.doesNotMatch(source, /href="\/wallet"/);
  assert.doesNotMatch(source, /Go to wallet/);
  assert.doesNotMatch(source, /LaneVisualizer/);
  assert.doesNotMatch(source, /ArchitectureSection/);
  assert.doesNotMatch(source, /Payment lanes|Privacy boundary|Supported assets/);
});

test("legacy standalone wallet pages and wrappers are removed", () => {
  const removedPaths = [
    "src/app/home/page.tsx",
    "src/app/home/page.test.ts",
    "src/app/private/page.tsx",
    "src/app/private/page.test.ts",
    "src/components/PrivatePaymentsHome.tsx",
    "src/components/PrivatePaymentsApp.tsx",
    "src/components/WalletHome.tsx",
    "src/components/WalletHome.test.ts",
    "src/components/WalletApp.tsx",
    "src/components/WalletConsole.tsx",
    "src/components/unified/PremiumWalletDashboard.tsx",
  ];

  for (const path of removedPaths) {
    assert.equal(existsSync(join(root, path)), false, `${path} should be removed`);
  }
});
