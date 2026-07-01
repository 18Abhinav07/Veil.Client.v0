import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("contacts API supports list and create through resolver-backed contact requests", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "contacts", "route.ts"),
    "utf8",
  );

  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /listWalletContacts/);
  assert.match(source, /findWalletProfileForContact/);
  assert.match(source, /createWalletContactRequest/);
  assert.match(source, /recordActivityEvent/);
  assert.match(source, /createNotification/);
  assert.match(source, /contact_request_received/);
  assert.match(source, /query is required/);
  assert.doesNotMatch(source, /stellarSecretKey|bn254NotePrivateKeyHex|x25519PrivateJwk/);
});
