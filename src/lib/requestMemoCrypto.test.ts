import test from "node:test";
import assert from "node:assert/strict";

import {
  decryptRequestMemo,
  encryptRequestMemo,
  type RequestMemoPlaintext,
} from "./requestMemoCrypto";
import { generateWalletSecrets } from "./vaultCrypto";

test("request memo crypto encrypts details for requester and payer only", async () => {
  const requester = await generateWalletSecrets();
  const payer = await generateWalletSecrets();
  const stranger = await generateWalletSecrets();
  const memo: RequestMemoPlaintext = {
    title: "June invoice",
    details: "Design and integration payment",
    createdAt: "2026-06-30T00:00:00.000Z",
  };

  const encrypted = await encryptRequestMemo({
    memo,
    requesterWallet: requester,
    payerX25519PublicHex: payer.x25519PublicHex,
  });

  const requesterView = await decryptRequestMemo({
    envelope: encrypted,
    wallet: requester,
    role: "requester",
  });
  const payerView = await decryptRequestMemo({
    envelope: encrypted,
    wallet: payer,
    role: "payer",
  });

  assert.deepEqual(requesterView, memo);
  assert.deepEqual(payerView, memo);
  await assert.rejects(
    () =>
      decryptRequestMemo({
        envelope: encrypted,
        wallet: stranger,
        role: "payer",
      }),
    /Could not decrypt request memo/,
  );
  assert.doesNotMatch(JSON.stringify(encrypted), /Design and integration payment/);
});
