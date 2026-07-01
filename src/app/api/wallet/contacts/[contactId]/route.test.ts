import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("contact detail API supports accept decline and remove actions", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "contacts", "[contactId]", "route.ts"),
    "utf8",
  );

  assert.match(source, /export async function PATCH/);
  assert.match(source, /acceptContactRequest/);
  assert.match(source, /declineContactRequest/);
  assert.match(source, /removeWalletContact/);
  assert.match(source, /accepted/);
  assert.match(source, /declined/);
  assert.match(source, /removed/);
  assert.match(source, /recordActivityEvent/);
  assert.match(source, /createNotification/);
  assert.match(source, /contact_request_accepted/);
  assert.match(source, /contact_request_declined/);
  assert.doesNotMatch(source, /stellarSecretKey|bn254NotePrivateKeyHex|x25519PrivateJwk/);
});
