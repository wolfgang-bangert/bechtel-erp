-- ============================================================================
-- Manuelle Anstöße für den sync-Worker aus der Web-App heraus (z. B. "Banken
-- aktualisieren"-Button). Der Worker braucht Python-venv/FinTS o.ä., das nur
-- im sync-Container existiert - die Web-App kann das nicht direkt ausführen.
-- Stattdessen legt sie eine Zeile hier an, ein Cron-Job im sync-Container
-- verarbeitet offene Anfragen alle paar Minuten (services/sync: requests:process).
-- ============================================================================

create table public.sync_request (
  id           uuid primary key default gen_random_uuid(),
  job          text not null check (job in ('fints:pull')),  -- Whitelist, bei Bedarf erweitern
  params       jsonb not null default '{}'::jsonb,
  status       text not null default 'pending'
               check (status in ('pending', 'running', 'done', 'error')),
  result       jsonb,
  error        text,
  requested_by uuid references public.app_user (id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);
create index sync_request_status_idx on public.sync_request (status, requested_at);

select public.attach_standard_triggers('public.sync_request'::regclass);
alter table public.sync_request enable row level security;
create policy sync_request_read on public.sync_request for select using (public.is_staff());
create policy sync_request_write on public.sync_request for all
  using (public.has_any_role(array['admin','office','production']::app_role[]))
  with check (public.has_any_role(array['admin','office','production']::app_role[]));
