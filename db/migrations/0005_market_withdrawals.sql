alter table market_user_notes drop constraint if exists market_user_notes_status_check;

alter table market_user_notes add constraint market_user_notes_status_check
  check (status in (
    'pending_deposit',
    'unspent',
    'pending_bet',
    'pending_withdraw',
    'escrowed',
    'spent',
    'payout_pending',
    'payout_received',
    'failed_recovery'
  ));
