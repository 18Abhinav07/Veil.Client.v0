import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  deleteEncryptedVault,
  getEncryptedVault,
  saveEncryptedVault,
} from "@/lib/server/walletRepository";
import { assertVaultStoragePayload } from "@/lib/vaultStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireUserId() {
  const session = await getServerSession(createAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { error: null, userId };
}

export async function GET() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const vault = await getEncryptedVault(getPgPool(), { userId: auth.userId });
  if (!vault) {
    return NextResponse.json({ vault: null }, { status: 404 });
  }

  return NextResponse.json({
    vault: {
      vaultVersion: vault.vault_version,
      vaultCiphertext: vault.vault_ciphertext,
      recoveryCiphertext: vault.recovery_ciphertext,
      kdfName: vault.kdf_name,
      kdfParams: vault.kdf_params,
      encryptionAlg: vault.encryption_alg,
    },
  });
}

export async function PUT(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const payload = await request.json();
  assertVaultStoragePayload(payload);

  const saved = await saveEncryptedVault(getPgPool(), {
    userId: auth.userId,
    vaultCiphertext: payload.vaultCiphertext,
    recoveryCiphertext: payload.recoveryCiphertext,
    kdfName: payload.kdfName,
    kdfParams: payload.kdfParams,
    encryptionAlg: payload.encryptionAlg,
  });

  return NextResponse.json({
    vault: {
      id: saved?.id,
      vaultVersion: saved?.vault_version ?? 2,
      kdfName: saved?.kdf_name ?? payload.kdfName,
      encryptionAlg: saved?.encryption_alg ?? payload.encryptionAlg,
    },
  });
}

export async function DELETE() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  await deleteEncryptedVault(getPgPool(), { userId: auth.userId });
  return NextResponse.json({ ok: true });
}
