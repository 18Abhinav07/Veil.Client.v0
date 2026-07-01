alter table market_bets add column if not exists relay_body jsonb;
alter table market_payouts add column if not exists relay_body jsonb;
alter table market_escrow_transfers add column if not exists relay_body jsonb;
