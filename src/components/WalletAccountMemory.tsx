"use client";

import { useEffect } from "react";

import { rememberWalletAccount } from "@/lib/rememberedWalletAccount";

export default function WalletAccountMemory({
  email,
  name,
}: {
  email?: string | null;
  name?: string | null;
}) {
  useEffect(() => {
    rememberWalletAccount({ email, name });
  }, [email, name]);

  return null;
}
