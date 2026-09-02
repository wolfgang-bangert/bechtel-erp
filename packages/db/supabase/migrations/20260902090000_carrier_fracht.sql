-- ============================================================================
-- Versand — Phase 1: Frachtdienstleister + Preistabellen + Zonen.
-- Grundlage: Ninox EB (Zonen), FB (Spedition kg-Staffel), FF (DPD/Post).
-- ============================================================================

create table public.carrier (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- dhl | dpd | post | wackler
  name        text not null,
  art         text not null default 'paket'
                check (art in ('paket', 'spedition', 'brief')),
  api_enabled boolean not null default false,
  is_active   boolean not null default true,
  notiz       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- PLZ-Präfix → Zone (v.a. Spedition/Wackler). plz_prefix = 1..2 Stellen als Text.
create table public.carrier_zone (
  id          uuid primary key default gen_random_uuid(),
  carrier_id  uuid not null references public.carrier (id) on delete cascade,
  plz_prefix  text not null,
  land        text not null default 'DE',
  zone        integer not null,
  unique (carrier_id, land, plz_prefix)
);

-- Preisstaffel. zone NULL = zonenunabhängig (DHL Einheitspreis, DPD, Post).
-- produkt NULL = Standard; sonst z.B. 'Parcel Letter', 'Warenpost', 'Palette'.
create table public.carrier_rate (
  id          uuid primary key default gen_random_uuid(),
  carrier_id  uuid not null references public.carrier (id) on delete cascade,
  produkt     text,
  zone        integer,
  kg_von      numeric(8,3) not null default 0,
  kg_bis      numeric(8,3) not null,
  preis       numeric(10,2) not null,
  gilt_ab     date,
  gilt_bis    date,
  notiz       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index carrier_rate_lookup_idx on public.carrier_rate (carrier_id, zone, kg_bis);

do $$
declare t text;
begin
  foreach t in array array['carrier', 'carrier_zone', 'carrier_rate'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Lesen: alle internen Rollen; Schreiben: admin/office/shipping.
do $$
declare t text;
begin
  foreach t in array array['carrier', 'carrier_zone', 'carrier_rate'] loop
    execute format($f$
      create policy %1$s_read on public.%1$s for select
        using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','shipping']::app_role[]))
        with check (public.has_any_role(array['admin','office','shipping']::app_role[]));
    $f$, t);
  end loop;
end $$;

insert into public.carrier (code, name, art, api_enabled) values
  ('dhl',     'DHL Paket',        'paket',     true),
  ('dpd',     'DPD',              'paket',     true),
  ('post',    'Deutsche Post',    'brief',     false),
  ('wackler', 'Wackler Spedition','spedition', true)
on conflict (code) do nothing;

-- DHL: Einheitspreis bis 31,5 kg — Platzhalter, bitte in der UI pflegen.
insert into public.carrier_rate (carrier_id, produkt, zone, kg_von, kg_bis, preis, notiz)
select id, 'Paket', null, 0, 31.5, 0, 'Einheitspreis — bitte eintragen'
from public.carrier where code = 'dhl'
on conflict do nothing;
