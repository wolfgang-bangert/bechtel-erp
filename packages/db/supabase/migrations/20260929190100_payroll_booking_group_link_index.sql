-- Nachtrag zu 20260929190000: der vorige Push wurde als angewendet
-- vermerkt, bevor der zweite Befehl (Composite-Unique-Index) ergänzt wurde -
-- separate Migration, damit er garantiert läuft (idempotent).
create unique index if not exists btm_payroll_booking_txn_uidx
  on public.bank_transaction_match (bank_transaction_id, payroll_booking_id)
  where payroll_booking_id is not null;
