-- ============================================================================
-- Kontostand je Bankkonto (aus FinTS-Saldenabfrage beim Abruf).
-- ============================================================================

alter table public.bank_account
  add column balance      numeric(14,2),
  add column balance_date date,          -- Buchungsstand laut Bank
  add column balance_at   timestamptz;   -- wann zuletzt abgerufen
