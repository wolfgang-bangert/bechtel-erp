-- ============================================================================
-- Mahnung / Zahlungserinnerung als eigener Belegtyp.
-- Wie ein Zahlungsavis: keine zu buchende Rechnung, sondern ein Hinweisbeleg
-- zu einer bereits existierenden Rechnung. Wird zusätzlich per E-Mail an einen
-- Bearbeiter weitergeleitet (forwarded_at protokolliert den Versand).
-- ============================================================================

alter table public.incoming_document
  drop constraint if exists incoming_document_doc_type_check;
alter table public.incoming_document
  add constraint incoming_document_doc_type_check
  check (doc_type in ('invoice', 'credit_note', 'receipt', 'payment_advice', 'dunning', 'unknown'));

alter table public.incoming_document
  drop constraint if exists incoming_document_status_check;
alter table public.incoming_document
  add constraint incoming_document_status_check
  check (status in ('captured', 'extracted', 'reviewed', 'booked', 'exported', 'rejected', 'advice', 'dunning'));

alter table public.incoming_document
  add column if not exists forwarded_at timestamptz;

comment on column public.incoming_document.forwarded_at is
  'Zeitpunkt der E-Mail-Weiterleitung (z.B. Mahnung an einen Bearbeiter).';
