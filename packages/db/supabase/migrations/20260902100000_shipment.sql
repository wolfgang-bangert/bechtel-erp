-- ============================================================================
-- Versand — Phase 2: Sendung + Empfänger + Packstücke + Positionen.
-- Eine SENDUNG (shipment) hat in dieser Ausbaustufe genau einen Empfänger
-- (shipment_recipient); die Verteilerliste (mehrere Empfänger) folgt später.
-- Packstücke und Positionen hängen am Empfänger, damit die spätere
-- Verteilerlogik ohne Umbau möglich ist.
-- ============================================================================

insert into public.number_sequence (key, prefix, padding, period, current_value) values
  ('shipment', 'VS-', 5, 'year', 0)
on conflict (key) do nothing;

create table public.shipment (
  id               uuid primary key default gen_random_uuid(),
  shipment_number  text unique,
  status           text not null default 'erfasst'
                     check (status in ('erfasst','gepackt','etikettiert','uebergeben','zugestellt','storniert')),
  carrier_id       uuid references public.carrier (id) on delete set null,
  carrier_service  text,                       -- Produkt, z.B. "DHL Paket", "Palette"
  organization_id  uuid not null references public.organization (id) on delete restrict,
  contact_id       uuid references public.contact (id) on delete set null,
  sales_order_id   uuid references public.sales_order (id) on delete set null,
  ship_date        date,
  frankatur        text,                       -- "frei Haus", "ab Werk", …
  notiz            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index shipment_org_idx on public.shipment (organization_id);
create index shipment_order_idx on public.shipment (sales_order_id);
create index shipment_status_idx on public.shipment (status);

-- Adress-Snapshot: bleibt stabil, auch wenn sich die Org-Adresse später ändert.
create table public.shipment_recipient (
  id                uuid primary key default gen_random_uuid(),
  shipment_id       uuid not null references public.shipment (id) on delete cascade,
  position          integer not null default 1,
  name              text not null,
  addition          text,                      -- c/o, z.Hd. …
  street            text,
  house_number      text,
  address_addition  text,
  zip               text,
  city              text,
  country           text not null default 'DE',
  contact_name      text,
  phone             text,
  email             text,
  source_address_id uuid references public.address (id) on delete set null,
  verified          boolean not null default false,
  verified_at       timestamptz,
  verified_by       text,
  verify_result     jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index shipment_recipient_shipment_idx on public.shipment_recipient (shipment_id);

create table public.shipment_package (
  id                    uuid primary key default gen_random_uuid(),
  shipment_recipient_id uuid not null references public.shipment_recipient (id) on delete cascade,
  position              integer not null default 1,   -- Packstück x von y
  art                   text not null default 'paket'
                          check (art in ('paket','paeckchen','karton','palette')),
  packaging_ref         text,
  weight_kg             numeric(10,3),
  length_cm             numeric(8,1),
  width_cm              numeric(8,1),
  height_cm             numeric(8,1),
  tracking_number       text,
  label_storage_key     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index shipment_package_recipient_idx on public.shipment_package (shipment_recipient_id);

create table public.shipment_item (
  id                    uuid primary key default gen_random_uuid(),
  shipment_recipient_id uuid not null references public.shipment_recipient (id) on delete cascade,
  position              integer not null default 1,
  sales_order_item_id   uuid references public.sales_order_item (id) on delete set null,
  description           text not null,
  quantity              numeric(14,3) not null default 1,
  unit                  text,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index shipment_item_recipient_idx on public.shipment_item (shipment_recipient_id);

do $$
declare t text;
begin
  foreach t in array array['shipment','shipment_recipient','shipment_package','shipment_item'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select
        using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','shipping']::app_role[]))
        with check (public.has_any_role(array['admin','office','shipping']::app_role[]));
    $f$, t);
  end loop;
end $$;
