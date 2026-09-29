-- ============================================================================
-- Die bisherigen Unique-Constraints "eine Rechnung/ein Beleg pro Bankzeile
-- nur einmal verknüpfbar" verhindern jetzt fälschlich die zweite,
-- zusätzliche Buchungszeile für Skonto zur selben Rechnung an derselben
-- Bankzeile (gleiches bank_transaction_id + sales_invoice_id/
-- incoming_document_id, aber mit ledger_account gesetzt). Auf eine
-- partielle Eindeutigkeit umstellen: nur "echte" Zahlungs-Zuordnungen
-- (ledger_account ist null) müssen pro Bankzeile eindeutig sein.
-- ============================================================================

alter table public.bank_transaction_match
  drop constraint if exists bank_transaction_match_bank_transaction_id_sales_invoice_id_key;
create unique index if not exists btm_txn_invoice_uidx
  on public.bank_transaction_match (bank_transaction_id, sales_invoice_id)
  where sales_invoice_id is not null and ledger_account is null;

drop index if exists public.btm_txn_incdoc_uidx;
create unique index if not exists btm_txn_incdoc_uidx
  on public.bank_transaction_match (bank_transaction_id, incoming_document_id)
  where incoming_document_id is not null and ledger_account is null;
