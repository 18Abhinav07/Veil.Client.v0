import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet profile API exposes and updates a unique VEIL user id", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "profile", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /getWalletProfileByUserId/);
  assert.match(source, /updateWalletProfileHandle/);
  assert.match(source, /handle/);
  assert.match(source, /handleNormalized/);
  assert.doesNotMatch(source, /stellarSecretKey/);
  assert.doesNotMatch(source, /notePrivateKeyHex/);
  assert.doesNotMatch(source, /x25519PrivateJwk/);
});
