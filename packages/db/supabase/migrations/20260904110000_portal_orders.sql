-- ============================================================================
-- Kundenschnittstellen ("Portale") + eingehende Druckaufträge.
-- Generische Ebene: jeder Kunde mit eigener Integration bekommt eine portal-Zeile
-- und einen Adapter in services/sync. Erster Adapter: onlineprinters.
-- Der Produktionsauftrag (Phase 2) wird kanal-agnostisch aus portal_order erzeugt.
-- ============================================================================

create table public.portal (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,           -- onlineprinters, …
  name            text not null,
  organization_id uuid references public.organization (id) on delete set null,
  kind            text not null default 'partner_api'
                    check (kind in ('partner_api', 'hosted_app')),
  config          jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.portal_order (
  id                  uuid primary key default gen_random_uuid(),
  portal_id           uuid not null references public.portal (id) on delete cascade,
  external_id         text not null,                -- onlineprinters UUID
  external_reference  text,                         -- reference (VS4-Nummer)
  reference_type      text,
  portal_state        text,                         -- Status laut Portal (NEW, FINISHED, …)
  -- normalisiert (kanalunabhängig)
  description         text,
  quantity            numeric(14,3),
  deliver_date        timestamptz,
  currency            char(3),
  total_net           numeric(14,2),
  total_gross         numeric(14,2),
  ship_to             jsonb,                        -- Empfängeradresse (normalisiert)
  sender              jsonb,                        -- Absenderadresse (normalisiert)
  -- Verarbeitung
  production_order_id uuid,                         -- FK folgt in Phase 2
  forwarded_at        timestamptz,
  error               text,
  raw                 jsonb not null,               -- pristine Portal-Payload
  received_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (portal_id, external_id)
);
create index portal_order_portal_idx on public.portal_order (portal_id);
create index portal_order_ref_idx on public.portal_order (external_reference);
create index portal_order_state_idx on public.portal_order (portal_state);

create table public.portal_order_item (
  id              uuid primary key default gen_random_uuid(),
  portal_order_id uuid not null references public.portal_order (id) on delete cascade,
  position        text,                             -- positionNumber ("001")
  sku             text,                             -- number ("DSPA444.O08.90")
  quantity        numeric(14,3),
  description     text,
  raw             jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index portal_order_item_order_idx on public.portal_order_item (portal_order_id);

create table public.portal_order_file (
  id              uuid primary key default gen_random_uuid(),
  portal_order_id uuid not null references public.portal_order (id) on delete cascade,
  typ             text not null
                    check (typ in ('printData', 'printDataPart', 'jobSheet', 'thumbnail',
                                   'deliveryNoteLabel', 'shippingLabel')),
  source_url      text,
  storage_key     text,                             -- S3-Key in werk
  filename        text,
  bytes           bigint,
  is_zip          boolean not null default false,
  fetched_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index portal_order_file_order_idx on public.portal_order_file (portal_order_id);

do $$
declare t text;
begin
  foreach t in array array['portal', 'portal_order', 'portal_order_item', 'portal_order_file'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office']::app_role[]))
        with check (public.has_any_role(array['admin','office']::app_role[]));
    $f$, t);
  end loop;
end $$;

insert into public.portal (code, name, kind, config) values
  ('onlineprinters', 'Onlineprinters (Lieferantenportal)', 'partner_api',
   '{"base": "https://api.partner.onlineprinters.info", "s3_prefix": "portal/onlineprinters", "poll_state": "NEW"}'::jsonb)
on conflict (code) do nothing;
