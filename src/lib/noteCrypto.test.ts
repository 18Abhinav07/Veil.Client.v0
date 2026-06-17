import test from "node:test";
import assert from "node:assert/strict";

import {
  decryptPrivateNote,
  encryptPrivateNote,
  type PrivateNoteSecrets,
} from "./noteCrypto";

const wallet = {
  stellarPublicKey: "GA".padEnd(56, "A"),
  stellarSecretKey: "SA".padEnd(56, "A"),
  bn254NotePrivateKeyHex: "11".repeat(32),
  bn254PublicHex: "22".repeat(32),
  membershipBlindingHex: "55".repeat(32),
  x25519PublicHex: "33".repeat(32),
  x25519PrivateJwk: { kty: "OKP", crv: "X25519", d: "abc", x: "def" },
  createdAt: "2026-06-28T00:00:00.000Z",
};

const note: PrivateNoteSecrets = {
  blindingHex: "0xblind",
  commitmentHex: "0xcommitment",
  amountUnits: "250000000",
  leafIndex: 7,
  dummyBlindingHex: "0xdummyblind",
  dummyCommitmentHex: "0xdummycommitment",
  createdAt: 1782660000000,
};

test("private note crypto encrypts spend material and decrypts with the wallet note key", async () => {
  const encrypted = await encryptPrivateNote(note, wallet);
  const serialized = JSON.stringify(encrypted);

  assert.doesNotMatch(serialized, /0xblind/);
  assert.doesNotMatch(serialized, /0xdummyblind/);
  assert.doesNotMatch(serialized, /\bseed\b/i);
  assert.match(serialized, /ciphertext/);

  await assert.rejects(
    () =>
      decryptPrivateNote(encrypted, {
        ...wallet,
        bn254NotePrivateKeyHex: "44".repeat(32),
      }),
    /Could not decrypt private note/,
  );
  assert.deepEqual(await decryptPrivateNote(encrypted, wallet), note);
});
