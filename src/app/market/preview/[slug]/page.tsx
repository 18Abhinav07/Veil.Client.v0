import { notFound } from "next/navigation";

import MarketDetailPage from "@/components/markets/MarketDetailPage";
import {
  buildMarketDetailPreviewPayload,
  buildPreviewWallet,
  isMarketUiPreviewEnabled,
} from "@/lib/marketVisualPreview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MarketDetailPreviewPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    marketUiPreview?: string;
  }>;
}

export default async function MarketDetailPreviewPage({
  params,
  searchParams,
}: MarketDetailPreviewPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!isMarketUiPreviewEnabled(process.env, query?.marketUiPreview)) notFound();

  return (
    <MarketDetailPage
      accountEmail="preview@veil.local"
      initialData={buildMarketDetailPreviewPayload(slug)}
      previewMode
      slug={slug}
      wallet={buildPreviewWallet()}
    />
  );
}
