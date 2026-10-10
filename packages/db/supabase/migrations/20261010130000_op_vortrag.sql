-- ============================================================================
-- Offene Posten zum Stichtag (Vortrag), z. B. 31.12.2025 laut BuchhaltungsButler.
-- werk kennt Zahlungen erst ab 2026: ältere Ausgangsrechnungen stehen sonst
-- als "offen" da, obwohl sie längst bezahlt sind. Akonto-Verrechnung (und
-- künftig die OP-Liste) nehmen vor dem Stichtag nur Rechnungen, die hier stehen.
-- Geladen mit `op:vortrag-laden` aus services/sync/data/bb-op-*-2025.json.
-- ============================================================================

create table if not exists public.op_vortrag (
  id          uuid primary key default gen_random_uuid(),
  stichtag    date not null,
  art         text not null check (art in ('forderung', 'verbindlichkeit')),
  nummer      text not null,
  partner_nr  text,
  offen       numeric(14,2) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (stichtag, art, nummer, partner_nr)
);
create index if not exists op_vortrag_partner_idx on public.op_vortrag (art, partner_nr);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.op_vortrag'::regclass) then
    perform public.attach_standard_triggers('public.op_vortrag'::regclass);
  end if;
end $$;
alter table public.op_vortrag enable row level security;
drop policy if exists op_vortrag_read on public.op_vortrag;
create policy op_vortrag_read on public.op_vortrag for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
drop policy if exists op_vortrag_write on public.op_vortrag;
create policy op_vortrag_write on public.op_vortrag for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
