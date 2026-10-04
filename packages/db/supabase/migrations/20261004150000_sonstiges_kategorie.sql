-- Kategorie "Sonstiges": Mahnungen UND Dokumente ohne Buchungsrelevanz (AGB, Widerrufsbelehrung, Werbung,
-- Preislisten, Angebote, Lieferscheine ...), die per Mail an rechnungen@ kommen. Technisch bleibt der Status
-- 'dunning' (Hinweisbeleg, nicht buchbar, wird weitergeleitet); neu ist doc_type 'other' für alles, was keine
-- Mahnung ist. force_invoice: der Nutzer hat ein fälschlich als Sonstiges erkanntes Dokument zur Rechnung erklärt -
-- die nächste Erkennung behandelt es dann als Rechnung.
alter table public.incoming_document drop constraint if exists incoming_document_doc_type_check;
alter table public.incoming_document
  add constraint incoming_document_doc_type_check
  check (doc_type in ('invoice', 'credit_note', 'receipt', 'payment_advice', 'dunning', 'other', 'unknown'));

alter table public.incoming_document
  add column if not exists force_invoice boolean not null default false;
