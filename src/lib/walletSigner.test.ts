import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";

import { signStellarPayload } from "./walletSigner";

const root = process.cwd();

test("wallet signer signs Stellar payloads with the vault secret key in browser-safe code", () => {
  const keypair = Keypair.random();
  const payload = new TextEncoder().encode("wallet-public-send-test");
  const payloadBase64 = Buffer.from(payload).toString("base64");

  const { signatureBase64 } = signStellarPayload({
    stellarSecretKey: keypair.secret(),
    payloadBase64,
  });

  assert.equal(
    keypair.verify(Buffer.from(payload), Buffer.from(signatureBase64, "base64")),
    true,
  );
});

test("wallet signer does not import Stellar SDK or server-only modules", () => {
  const source = readFileSync(join(root, "src", "lib", "walletSigner.ts"), "utf8");

  assert.doesNotMatch(source, /@stellar\/stellar-sdk/);
  assert.doesNotMatch(source, /@stellar\/stellar-base/);
  assert.doesNotMatch(source, /server-only/);
});
