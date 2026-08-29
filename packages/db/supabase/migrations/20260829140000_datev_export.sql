-- ============================================================================
-- DATEV-Export (EXTF-Buchungsstapel). Jeder erzeugte Export wird unveränderlich
-- protokolliert (Zeitraum, Zeilenzahl, Datei-Hash) — GoBD-Nachvollziehbarkeit.
-- ============================================================================

create table public.datev_export (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'buchungsstapel',
  format        text not null default 'EXTF',
  scope         text not null default 'debitor'
                  check (scope in ('debitor', 'kreditor', 'zahlungen')),
  period_start  date not null,
  period_end    date not null,
  row_count     int  not null default 0,
  gross_total   numeric(14,2),
  skipped_count int  not null default 0,
  file_name     text not null,
  file_sha256   text not null,
  file_bytes    bigint,
  storage_key   text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create table public.datev_export_line (
  id              uuid primary key default gen_random_uuid(),
  datev_export_id uuid not null references public.datev_export (id) on delete cascade,
  source_table    text not null,
  source_id       uuid not null
);
create index datev_export_line_export_idx on public.datev_export_line (datev_export_id);

alter table public.datev_export enable row level security;
alter table public.datev_export_line enable row level security;

create policy datev_export_read on public.datev_export for select
  using (public.has_any_role(array['admin', 'accounting']::app_role[]));
create policy datev_export_line_read on public.datev_export_line for select
  using (public.has_any_role(array['admin', 'accounting']::app_role[]));

-- Erlöskonten-Zuordnung (SKR03) — im Admin anpassbar, mit Steuerberater bestätigen.
insert into public.setting (key, value) values (
  'datev.revenue_accounts',
  '{"standard_19":"8400","standard_7":"8300","reverse_charge_eu":"8336","intra_community_supply":"8336","export_third_country":"8120","tax_free_other":"8200","fallback":"8200"}'::jsonb
)
on conflict (key) do nothing;
