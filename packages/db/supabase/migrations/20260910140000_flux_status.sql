-- ============================================================================
-- flux-Statusrückmeldung: flux schickt nach dem Drucken Statusmeldungen per
-- Webhook an werk (POST /api/flux/webhook, HMAC X-Signature).
--
--   flux_status_log        jede eingehende Meldung roh + geparst (Audit)
--   portal_order.flux_*    letzter Status je Auftrag (denormalisiert für die Liste)
--   job.flux_*             letzter Status je Druckjob (flux meldet je orderItem)
--   setting flux_status_map    flux-Status-String -> werk job.status (ohne Code tunbar)
--   setting flux_order_url_tpl Direktlink-Muster auf die flux-Auftragsseite
-- ============================================================================

create table public.flux_status_log (
  id                 uuid primary key default gen_random_uuid(),
  portal_order_id    uuid references public.portal_order (id) on delete set null,
  job_id             uuid references public.job (id) on delete set null,
  flux_order_id      text,
  flux_order_item_id text,
  event              text,                       -- flux-Event-Name, falls mitgeliefert
  status             text,                       -- roher flux-Status/State-String
  work_step          text,                       -- flux workStep, falls mitgeliefert
  message            text,
  matched            boolean not null default false,
  signature_ok       boolean,                    -- HMAC geprüft? null = kein Secret gesetzt
  raw                jsonb not null default '{}'::jsonb,
  received_at        timestamptz not null default now()
);
create index flux_status_log_order_idx on public.flux_status_log (portal_order_id);
create index flux_status_log_flux_order_idx on public.flux_status_log (flux_order_id);
create index flux_status_log_received_idx on public.flux_status_log (received_at desc);

alter table public.portal_order
  add column if not exists flux_status     text,
  add column if not exists flux_status_at  timestamptz,
  add column if not exists flux_work_step  text;

alter table public.job
  add column if not exists flux_status     text,
  add column if not exists flux_status_at  timestamptz;

-- ---------------------------------------------------------------- Trigger + RLS
do $$
begin
  perform public.attach_standard_triggers('public.flux_status_log'::regclass);
  alter table public.flux_status_log enable row level security;
  create policy flux_status_log_read on public.flux_status_log
    for select using (public.is_staff());
  create policy flux_status_log_write on public.flux_status_log
    for all
    using (public.has_any_role(array['admin','office','production']::app_role[]))
    with check (public.has_any_role(array['admin','office','production']::app_role[]));
end $$;

-- ---------------------------------------------------------------- Settings
-- flux-Status -> werk job.status. Schlüssel klein/ohne Sonderzeichen normalisiert
-- (der Webhook lowercased + trimmt). Nicht getroffene Status bleiben roh stehen.
insert into public.setting (key, value, scope)
values (
  'flux_status_map',
  jsonb_build_object(
    'received',      'an_flux',
    'created',       'an_flux',
    'queued',        'an_flux',
    'in_progress',   'im_druck',
    'inproduction',  'im_druck',
    'in_production', 'im_druck',
    'printing',      'im_druck',
    'printed',       'gedruckt',
    'done',          'gedruckt',
    'completed',     'fertig',
    'finished',      'fertig',
    'shipped',       'fertig',
    'delivered',     'fertig',
    'cancelled',     'storniert',
    'canceled',      'storniert',
    'error',         null
  ),
  'company'
)
on conflict (key) do nothing;

insert into public.setting (key, value, scope)
values (
  'flux_order_url_tpl',
  to_jsonb('https://flux.bechtel-druck.de/order/{orderId}'::text),
  'company'
)
on conflict (key) do nothing;
