-- ============================================================================
-- onlineprinters: Produktstruktur + Materialregeln (Neuaufbau, aus Xano opri_*).
--   opri_produkt_gruppe  → Regelebene 1 (flux_template-Default)
--   opri_stammartikel    → Regelebene 2 (flux_template-Override, NULL = erben)
--   opri_sku             → flache SKU-Liste aus Sortiment_Bechtel_Gesamt.xlsx
--                          (Hauptartikel-Varianten + Optionswerte), zum Matchen
--   opri_material_regel  → Regeln (Ebene · Modus · Bedingung → Materialzeile)
-- Auflösung wird als Vorschau in portal_order.resolve_result gecacht.
-- ============================================================================

create table public.opri_produkt_gruppe (
  id                   uuid primary key default gen_random_uuid(),
  kuerzel              text not null unique,          -- H4 (DKL, DWK, PBS …)
  name                 text not null,
  flux_template        text,
  druckverfahren       text,
  notiz                text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.opri_stammartikel (
  id             uuid primary key default gen_random_uuid(),
  gruppe_id      uuid references public.opri_produkt_gruppe (id) on delete set null,
  sku            text not null,                        -- H5 (DKLA540)
  sku_norm       text not null unique,
  name           text not null,
  flux_template  text,                                 -- NULL = von Gruppe erben
  notiz          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index opri_stammartikel_gruppe_idx on public.opri_stammartikel (gruppe_id);

create table public.opri_sku (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null,                      -- wie im Excel
  sku_norm         text not null unique,               -- Trennzeichen raus, UPPER
  typ              text not null
                     check (typ in ('hauptartikel', 'option')),
  stammartikel_id  uuid references public.opri_stammartikel (id) on delete set null,
  gruppe_kuerzel   text,
  option_typ_sku   text,                               -- H5 der Option (ZDDKLXXB)
  option_typ_name  text,                               -- "Wire-O-Bindung"
  wert_name        text,                               -- "Spiralenfarbe Weiß"
  bezeichnung      text,
  attribute        jsonb not null default '{}'::jsonb, -- decodiert: grammatur_g, sorte, oberflaeche, blatt, seiten
  sheet            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index opri_sku_stamm_idx on public.opri_sku (stammartikel_id);
create index opri_sku_typ_idx on public.opri_sku (typ);

create table public.opri_material_regel (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  ebene                  text not null check (ebene in ('gruppe', 'stammartikel', 'option')),
  gruppe_id              uuid references public.opri_produkt_gruppe (id) on delete cascade,
  stammartikel_id        uuid references public.opri_stammartikel (id) on delete cascade,
  option_match           text,                         -- Optionstyp-Name oder SKU-Präfix
  bedingung              jsonb not null default '{}'::jsonb,  -- {sku_praefix, grammatur_min/max, attribut:{k,v}}
  modus                  text not null default 'hinzufuegen'
                           check (modus in ('hinzufuegen', 'ersetzen', 'entfernen')),
  material_rolle         text,                         -- Zielrolle (frei / aus material_rolle.name)
  verwendung            text,                         -- "Kalendarium", "Rückblatt", "Cover Vorderseite"
  herkunft               text check (herkunft in
                           ('katalog_fix', 'aus_grammatur_oberflaeche', 'aus_format',
                            'wire_o_blockstaerke', 'aus_farbe_text')),
  material_id            uuid references public.material (id) on delete set null,
  mengen_formel         text not null default 'auflage',
  grammatur             text,
  format                text,
  produktionshinweis    text,
  zaehlt_zur_blockstaerke boolean not null default false,
  seite                 text check (seite in ('vorderseite', 'rueckseite')),
  bedruckt              boolean,
  prio                  integer not null default 100,
  is_active             boolean not null default true,
  notiz                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index opri_material_regel_ebene_idx on public.opri_material_regel (ebene, is_active);

alter table public.portal_order
  add column resolve_result jsonb,
  add column resolved_at    timestamptz;

do $$
declare t text;
begin
  foreach t in array array['opri_produkt_gruppe', 'opri_stammartikel', 'opri_sku', 'opri_material_regel'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','production']::app_role[]))
        with check (public.has_any_role(array['admin','office','production']::app_role[]));
    $f$, t);
  end loop;
end $$;
