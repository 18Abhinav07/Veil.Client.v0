alter table market_bets add column if not exists escrow_encrypted_note_ciphertext text;
alter table market_bets add column if not exists change_amount_units numeric(40, 0);
alter table market_bets add column if not exists encrypted_change_note_ciphertext text;
