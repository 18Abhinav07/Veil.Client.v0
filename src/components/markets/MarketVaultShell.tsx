"use client";

import VaultGate from "@/components/VaultGate";
import { WalletRealtimeProvider } from "@/components/unified/WalletRealtimeProvider";
import type { WalletSecrets } from "@/lib/vaultCrypto";

import MarketDetailPage from "./MarketDetailPage";
import MarketsPage from "./MarketsPage";

type MarketVaultShellProps = {
  accountEmail?: string | null;
  slug?: string;
};

export default function MarketVaultShell({ accountEmail, slug }: MarketVaultShellProps) {
  return (
    <VaultGate>
      {(wallet: WalletSecrets) =>
        (
          <WalletRealtimeProvider>
            {slug ? (
              <MarketDetailPage accountEmail={accountEmail} slug={slug} wallet={wallet} />
            ) : (
              <MarketsPage accountEmail={accountEmail} wallet={wallet} />
            )}
          </WalletRealtimeProvider>
        )
      }
    </VaultGate>
  );
}
