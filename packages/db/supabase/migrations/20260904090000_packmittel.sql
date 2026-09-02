-- ============================================================================
-- Kartonagen-Stamm + Kapazitätsregeln (aus Ninox ZG / XG).
-- Grundsatz: Regeln erzeugen nur einen VORSCHLAG. Packstücke bleiben in der
-- Sendung jederzeit frei editier- und ergänzbar; Regeln matchen lose über
-- Freitext (produkt_tag), nicht über einen starren Produktschlüssel.
-- Maße in mm (wie Ninox), Umrechnung auf cm erst beim Packstück.
-- ============================================================================

create table public.packmittel (
  id                  uuid primary key default gen_random_uuid(),
  bezeichnung         text not null,
  interne_bezeichnung text,
  kategorie           text,
  laenge_mm           integer,
  breite_mm           integer,
  hoehe_mm            integer,
  leergewicht_kg      numeric(10,3) not null default 0,   -- Tara
  max_fuellgewicht_kg numeric(10,3),
  material            text,
  fefco               text,
  volumen_m3          numeric(12,6),
  preis_kalk          numeric(12,4),
  bestellnummer       text,
  lagerplatz          text,
  ninox_ref           text unique,
  notiz               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index packmittel_aktiv_idx on public.packmittel (is_active);

create table public.packregel (
  id                uuid primary key default gen_random_uuid(),
  produkt_tag       text,                       -- leer = matcht jede Bezeichnung
  stueck_von        integer not null default 0,
  stueck_bis        integer not null,
  packmittel_id     uuid references public.packmittel (id) on delete set null,
  spedition_erlaubt boolean not null default true,
  prio              integer not null default 100,
  ninox_ref         text unique,
  notiz             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index packregel_lookup_idx on public.packregel (is_active, prio, stueck_bis);

alter table public.shipment_package
  add column packmittel_id uuid references public.packmittel (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['packmittel', 'packregel'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','shipping']::app_role[]))
        with check (public.has_any_role(array['admin','office','shipping']::app_role[]));
    $f$, t);
  end loop;
end $$;
