import { notFound } from "next/navigation";

import AdminMarketsConsole from "@/components/admin/AdminMarketsConsole";
import {
  buildAdminPreviewMarkets,
  buildAdminPreviewPayoutQueues,
  isMarketUiPreviewEnabled,
} from "@/lib/marketVisualPreview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AdminMarketsPreviewPageProps {
  searchParams?: Promise<{
    marketUiPreview?: string;
  }>;
}

export default async function AdminMarketsPreviewPage({ searchParams }: AdminMarketsPreviewPageProps) {
  const params = await searchParams;
  if (!isMarketUiPreviewEnabled(process.env, params?.marketUiPreview)) notFound();

  return (
    <AdminMarketsConsole
      adminEmail="preview@veil.local"
      initialMarkets={buildAdminPreviewMarkets()}
      initialPayoutQueueByMarket={buildAdminPreviewPayoutQueues()}
      previewMode
    />
  );
}
