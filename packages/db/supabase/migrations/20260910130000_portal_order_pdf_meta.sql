-- Ergebnis der PDF-Analyse der Druckdaten (Ausrichtung/Endformat/Seiten).
-- Wird nur für Aufträge gefüllt, deren resolve_result keine Ausrichtung hat;
-- der Resolver nimmt sie dann als Fallback (attribute.ausrichtung_quelle = "pdf").
alter table public.portal_order add column if not exists pdf_meta jsonb;
