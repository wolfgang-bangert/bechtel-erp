-- ============================================================================
-- Eine Buchungszeile darf jetzt gleichzeitig einen Belegbezug (Rechnung/
-- Eingangsrechnung) UND ein Sachkonto haben - Beispiel Skonto: die Zeile
-- muss wissen "gehört zu Rechnung XY" (damit die Rechnung als beglichen
-- gilt, sobald alle ihre Buchungszeilen den Betrag ausgleichen) UND
-- "gebucht auf Sachkonto 8736" (für DATEV). Bisher erzwang btm_one_target
-- genau eins von beidem.
-- ============================================================================

alter table public.bank_transaction_match
  drop constraint if exists btm_one_target;
alter table public.bank_transaction_match
  add constraint btm_one_target check (
    (sales_invoice_id is not null)
    or (incoming_document_id is not null)
    or (ledger_account is not null)
    or (
      sales_invoice_id is null and incoming_document_id is null
      and ledger_account is null and kind is not null
    )
  );
