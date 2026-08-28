-- ============================================================================
-- organization_external_ref: Rohdaten des Fremdsystems mitführen
-- (Keyline reference-Code, Debitor/Kreditor-Kennungen, Locale, ...).
-- Dient der Nachvollziehbarkeit und dem späteren Dublettenabgleich.
-- ============================================================================

alter table public.organization_external_ref
  add column if not exists metadata jsonb not null default '{}'::jsonb;
