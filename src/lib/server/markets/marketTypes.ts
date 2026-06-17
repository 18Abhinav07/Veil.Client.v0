export type MarketOutcome = "YES" | "NO";

export type MarketStatus =
  | "draft"
  | "open"
  | "closed"
  | "resolved"
  | "cancelled"
  | "settling"
  | "settled";

export type MarketBetStatus =
  | "pending"
  | "submitted"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "settled";

export type MarketCategory =
  | "Crypto"
  | "Macro"
  | "Tech"
  | "Finance"
  | "Weather"
  | "Demo";

export interface MarketSeed {
  slug: string;
  title: string;
  category: MarketCategory;
  status: MarketStatus;
  closesAt: string;
  resolvesAt: string | null;
  outcomes: readonly [MarketOutcome, MarketOutcome];
  rules: string;
  resolutionSource: string;
  iconName: string;
  displayOrder: number;
  demoOnly: boolean;
}

export interface ConfirmedMarketBet {
  userId: string;
  outcome: MarketOutcome;
  amountUnits: string;
}

export interface MarketPayout {
  userId: string;
  amountUnits: string;
}
