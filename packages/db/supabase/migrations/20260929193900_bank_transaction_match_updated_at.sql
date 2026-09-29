-- ============================================================================
-- bank_transaction_match bekam beim Anlegen (20260829170000_bank.sql) über
-- attach_standard_triggers() den before-update-Trigger für updated_at, aber
-- nie die Spalte selbst - ein UPDATE auf dieser Tabelle schlug seither immer
-- mit "record new has no field updated_at" fehl. Bisher unbemerkt, weil
-- nichts diese Zeilen je per UPDATE änderte (nur INSERT/DELETE) - die neue
-- "nachträglich verknüpfen"-Funktion bei Lohnbuchungen ist der erste Code,
-- der das tut.
-- ============================================================================

alter table public.bank_transaction_match
  add column if not exists updated_at timestamptz not null default now();
