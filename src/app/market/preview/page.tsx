import { notFound } from "next/navigation";

import MarketsPage from "@/components/markets/MarketsPage";
import {
  buildMarketPreviewPayload,
  buildPreviewPublicWalletState,
  buildPreviewWallet,
  isMarketUiPreviewEnabled,
} from "@/lib/marketVisualPreview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MarketPreviewPageProps {
  searchParams?: Promise<{
    marketUiPreview?: string;
  }>;
}

export default async function MarketPreviewPage({ searchParams }: MarketPreviewPageProps) {
  const params = await searchParams;
  if (!isMarketUiPreviewEnabled(process.env, params?.marketUiPreview)) notFound();

  return (
    <MarketsPage
      accountEmail="preview@veil.local"
      initialData={buildMarketPreviewPayload()}
      initialPublicAccount={buildPreviewPublicWalletState()}
      previewMode
      wallet={buildPreviewWallet()}
    />
  );
}
