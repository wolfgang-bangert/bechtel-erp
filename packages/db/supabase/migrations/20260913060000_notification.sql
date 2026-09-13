-- ============================================================================
-- In-App-Benachrichtigungen (z. B. Fehler aus dem n8n-Bank-Sync-Workflow).
--
--   notification        Meldung für die App (Glocke im Layout), read_at/read_by
--                        beim Abhaken durch Mitarbeitende.
--   sync_request.notified_at  neue Spalte: markiert Anfragen, die ein externer
--                        Beobachter (n8n) schon zu einer Meldung verarbeitet
--                        hat – verhindert doppelte Benachrichtigungen, ohne
--                        dass n8n selbst Zustand halten muss.
-- ============================================================================

alter table public.sync_request
  add column if not exists notified_at timestamptz;

create table public.notification (
  id         uuid primary key default gen_random_uuid(),
  level      text not null default 'info'
             check (level in ('info', 'warning', 'error')),
  source     text not null,             -- z. B. 'bank_sync'
  title      text not null,
  message    text not null,
  context    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  read_by    uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_unread_idx on public.notification (created_at)
  where read_at is null;

select public.attach_standard_triggers('public.notification'::regclass);
alter table public.notification enable row level security;

-- Lesen dürfen alle Mitarbeitenden, "gelesen"-markieren ebenso. Einfügen
-- passiert nur serverseitig über den Service-Role-Client
-- (apps/web/src/app/api/n8n/notify/route.ts) – dafür bewusst keine
-- Insert-Policy für eingeloggte Nutzer.
create policy notification_read on public.notification for select using (public.is_staff());
create policy notification_mark_read on public.notification for update
  using (public.is_staff())
  with check (public.is_staff());
