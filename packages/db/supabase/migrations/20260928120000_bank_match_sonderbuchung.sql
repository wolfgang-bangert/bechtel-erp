-- Sonderbuchungen auf Bank-Umsätzen ohne Beleg (Skonto, Doppelzahlung,
-- Sonstiges) - bisher musste jede Zuordnung (btm_one_target) entweder auf
-- eine sales_invoice oder eine incoming_document zeigen. Jetzt zusätzlich
-- ein dritter, belegloser Fall über kind+note.
alter table public.bank_transaction_match
  add column if not exists kind text
    check (kind in ('skonto', 'doppelzahlung', 'sonstige')),
  add column if not exists note text;

alter table public.bank_transaction_match
  drop constraint if exists btm_one_target;
alter table public.bank_transaction_match
  add constraint btm_one_target check (
    (sales_invoice_id is not null)::int
    + (incoming_document_id is not null)::int
    + (kind is not null)::int = 1
  );
