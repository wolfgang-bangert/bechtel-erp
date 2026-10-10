-- ============================================================================
-- Bestellnummern + PDF-Prüfung für Eingangsbelege.
--
-- Amazon-Lastschriften tragen im Verwendungszweck die Bestellnummer
-- (305-7818498-7269112), die Rechnungen nur die Rechnungsnummer (DE6…). Die KI
-- liest die Bestellnummer(n) aus dem PDF (incoming:extract bzw. einmalig
-- belege:pdf-pruefen); /bank schlägt darüber die Rechnung(en) vor.
-- pdf_pruefung: Ergebnis des Abgleichs PDF ↔ gespeicherte Daten (Verkäufer,
-- Rechnungsnummer, Betrag) - Abweichungen erscheinen auf der Prüfliste.
-- ============================================================================

alter table public.incoming_document
  add column if not exists bestellnummern text[],
  add column if not exists pdf_pruefung jsonb;

create index if not exists incoming_document_bestellnummern_idx
  on public.incoming_document using gin (bestellnummern);
