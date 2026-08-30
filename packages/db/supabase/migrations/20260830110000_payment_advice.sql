-- ============================================================================
-- Zahlungs-/Lastschriftavis als eigener Belegtyp.
-- Ein Avis (z.B. "Avis SEPA-Firmenlastschrift", "Lastschrift-Avis",
-- "Einzugsavis") ist KEINE Eingangsrechnung, sondern kündigt eine
-- Kontobelastung an und nennt die Rechnungsnummer(n), auf die sie sich
-- bezieht. Es dient nur als Hilfe beim Kontoauszug-Abgleich und darf nicht
-- in der Kreditoren-Prüfliste als Rechnung auftauchen.
-- ============================================================================

alter table public.incoming_document
  drop constraint if exists incoming_document_doc_type_check;
alter table public.incoming_document
  add constraint incoming_document_doc_type_check
  check (doc_type in ('invoice', 'credit_note', 'receipt', 'payment_advice', 'unknown'));

alter table public.incoming_document
  drop constraint if exists incoming_document_status_check;
alter table public.incoming_document
  add constraint incoming_document_status_check
  check (status in ('captured', 'extracted', 'reviewed', 'booked', 'exported', 'rejected', 'advice'));

alter table public.incoming_document
  add column if not exists advice_debit_date date,
  add column if not exists advice_reference  text[];

comment on column public.incoming_document.advice_reference is
  'doc_type=payment_advice: Rechnungsnummer(n), auf die sich das Avis bezieht '
  '(Hilfe für den Kontoauszug-Abgleich).';
comment on column public.incoming_document.advice_debit_date is
  'doc_type=payment_advice: angekündigtes Belastungsdatum der Lastschrift.';

create index if not exists incoming_document_advice_idx
  on public.incoming_document (advice_debit_date)
  where doc_type = 'payment_advice';
