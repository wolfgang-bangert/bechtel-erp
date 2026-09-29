-- ============================================================================
-- Gelernte Sachkonto-Zuordnung für beleglose Bankbuchungen: aus der
-- BuchhaltungsButler-Historie lässt sich pro Gegenseite (z.B. "Allianz
-- Versicherungs-AG" -> immer 4520) ein Vorschlag ableiten - analog zu
-- posting_rule (Kreditor -> Aufwandskonto), nur ohne organization_id (die
-- Gegenseite einer Sachkonto-Buchung ist meist keine erfasste Organisation,
-- z.B. Bankgebühren, Versicherungen, Leasingraten).
-- ============================================================================

create table public.bank_ledger_rule (
  id                 uuid primary key default gen_random_uuid(),
  counterparty_key   text not null unique,  -- normalisiert (lower, getrimmt) für den Abgleich
  counterparty_name  text not null,         -- Anzeige-Schreibweise
  ledger_account     text not null,
  sample_postingtext text,                  -- ein Beispiel-Buchungstext zur Orientierung
  sample_count       integer not null default 0,
  confidence         numeric(4,3),
  source             text not null default 'learned' check (source in ('learned', 'manual')),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$
begin
  perform public.attach_standard_triggers('public.bank_ledger_rule'::regclass);
end $$;
alter table public.bank_ledger_rule enable row level security;

create policy blr_staff_read on public.bank_ledger_rule for select using (public.is_staff());
create policy blr_staff_write on public.bank_ledger_rule for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

-- Debitoren-Gegenstück zu posting_rule.expense_account: gelerntes
-- Erlöskonto je Kunde (Ausnahme vom Standard-Automatikkonto nach
-- Steuersatz, z.B. Sparkassen/Volksbanken konsequent auf 8401 statt 8400).
alter table public.posting_rule
  add column if not exists revenue_account text;
