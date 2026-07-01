import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet resolver API supports email handle and address lookups without secrets", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "resolve", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /findRegisteredRecipient/);
  assert.match(source, /registeredInPool/);
  assert.match(source, /bn254PublicHex/);
  assert.match(source, /x25519PublicHex/);
  assert.match(source, /stellarPublicKey/);
  assert.doesNotMatch(source, /notePrivateKeyHex/);
  assert.doesNotMatch(source, /stellarSecretKey/);
  assert.doesNotMatch(source, /x25519PrivateJwk/);
});
