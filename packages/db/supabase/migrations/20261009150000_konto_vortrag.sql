-- ============================================================================
-- Saldovorträge je Konto und Jahr (Anfangsbestand zum 01.01.), z. B. aus der
-- Summen- und Saldenliste / Bilanz des Vorjahres vom Steuerberater.
-- werk führt keine Vorjahresbuchungen; ohne Vortrag stehen z. B. die im Januar
-- bezahlte Dezember-Lohnsteuer (1741) oder die Vorjahres-USt (1790) das ganze
-- Jahr als Fehlbetrag da. Kontoabruf (/konten) und Lohn-Übersicht rechnen den
-- Vortrag ein. saldo: Soll positiv, Haben negativ.
-- ============================================================================

create table if not exists public.konto_vortrag (
  id         uuid primary key default gen_random_uuid(),
  jahr       integer not null check (jahr between 2000 and 2100),
  konto      text not null,
  saldo      numeric(14,2) not null,
  notiz      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jahr, konto)
);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.konto_vortrag'::regclass) then
    perform public.attach_standard_triggers('public.konto_vortrag'::regclass);
  end if;
end $$;
alter table public.konto_vortrag enable row level security;

drop policy if exists konto_vortrag_read on public.konto_vortrag;
create policy konto_vortrag_read on public.konto_vortrag for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
drop policy if exists konto_vortrag_write on public.konto_vortrag;
create policy konto_vortrag_write on public.konto_vortrag for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
