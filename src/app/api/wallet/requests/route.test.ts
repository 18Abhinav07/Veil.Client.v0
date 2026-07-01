import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("payment requests API lists and creates encrypted contact-bound requests", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "requests", "route.ts"),
    "utf8",
  );

  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /listPaymentRequests/);
  assert.match(source, /createPaymentRequest/);
  assert.match(source, /findAcceptedContactProfile/);
  assert.match(source, /memoCiphertext/);
  assert.match(source, /USDC/);
  assert.match(source, /recordActivityEvent/);
  assert.match(source, /createNotification/);
  assert.match(source, /payment_request_received/);
  assert.doesNotMatch(source, /memoText|plainMemo|detailsText/);
  assert.doesNotMatch(source, /stellarSecretKey|bn254NotePrivateKeyHex|x25519PrivateJwk/);
});
