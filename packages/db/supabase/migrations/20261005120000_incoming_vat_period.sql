-- Vorsteuer-Zeitraum: Datum, nach dem ein Eingangsbeleg in der UStVA zählt (Rechnung lag z.B. erst im Folgemonat vor).
-- Leer = Belegdatum.
alter table public.incoming_document
  add column if not exists vat_period_date date;
