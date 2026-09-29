-- ============================================================================
-- Lohnbuchungen: monatlicher DATEV-EXTF-Buchungsstapel vom Lohnabrechner
-- (Bank, Verrechnungskonto 1755, Lohnkosten) - 1:1 importiert für die
-- Lohnkosten-Auswertung, die "echte Geld bewegt"-Zeilen (Gegenkonto in den
-- Verbindlichkeiten-/Personalkonten) werden manuell mit der passenden
-- Bankzeile verknüpft (wie Rechnung/Eingangsrechnung: ledger_account +
-- payroll_booking_id auf einer bank_transaction_match-Zeile).
-- ============================================================================

create table public.payroll_import (
  id           uuid primary key default gen_random_uuid(),
  file_name    text not null,
  period_start date,
  period_end   date,
  mandanten_nr text,
  row_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.payroll_booking (
  id            uuid primary key default gen_random_uuid(),
  import_id     uuid not null references public.payroll_import (id) on delete cascade,
  position      integer not null,
  amount        numeric(14,2) not null,
  soll_haben    text not null check (soll_haben in ('S', 'H')),
  konto         text not null,
  gegenkonto    text not null,
  bu_schluessel text,
  beleg_datum   date,
  belegfeld1    text,
  belegfeld2    text,
  buchungstext  text,
  kost1         text,
  kost2         text,
  raw           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index payroll_booking_import_idx on public.payroll_booking (import_id);
create index payroll_booking_gegenkonto_idx on public.payroll_booking (gegenkonto);

alter table public.bank_transaction_match
  add column if not exists payroll_booking_id uuid references public.payroll_booking (id) on delete set null;
create index if not exists btm_payroll_booking_idx
  on public.bank_transaction_match (payroll_booking_id) where payroll_booking_id is not null;
-- höchstens eine Bankzeile pro Lohnbuchung.
create unique index if not exists btm_payroll_booking_uidx
  on public.bank_transaction_match (payroll_booking_id) where payroll_booking_id is not null;

do $$
begin
  perform public.attach_standard_triggers('public.payroll_import'::regclass);
  perform public.attach_standard_triggers('public.payroll_booking'::regclass);
  execute 'alter table public.payroll_import enable row level security';
  execute 'alter table public.payroll_booking enable row level security';
end $$;

create policy pi_read  on public.payroll_import for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
create policy pi_write on public.payroll_import for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy pb_read  on public.payroll_booking for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
create policy pb_write on public.payroll_booking for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
