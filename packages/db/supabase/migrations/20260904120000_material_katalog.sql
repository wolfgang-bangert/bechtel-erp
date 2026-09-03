-- ============================================================================
-- Zentraler Materialkatalog (Startbestand aus Xano material_katalog / _rollen /
-- zz_diameterDoubleWire). Referenziert von den onlineprinters-Materialregeln,
-- später auch von packmittel / Wire-O-Kalkulation. Kaufmännische Ebene (Nummer,
-- Lieferant, Preis, Bestand) ist als Platzhalter angelegt, vorerst ungenutzt.
-- ============================================================================

create table public.material_rolle (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,   -- Papier, Wire-O-Drahtbinderücken, Deckblatt …
  sort       integer not null default 100,
  is_active  boolean not null default true,
  xano_ref   text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.material (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  name_kurz      text,
  beschreibung   text,
  rolle_id       uuid references public.material_rolle (id) on delete set null,
  attribute      jsonb not null default '{}'::jsonb,   -- Grammatur_g, Sorte, Oberfläche, Dicke_mikrometer …
  is_active      boolean not null default true,
  -- kaufmännische Ebene (Platzhalter, später befüllen)
  material_nummer   text unique,
  lieferant_org_id  uuid references public.organization (id) on delete set null,
  einkaufspreis     numeric(12,4),
  einkaufs_einheit  text,
  bestand           numeric(14,3),
  lagerort          text,
  xano_ref       text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index material_rolle_idx on public.material (rolle_id);
create index material_aktiv_idx on public.material (is_active);

-- Wire-O: Blockstärke → Drahtdurchmesser / Teilung
create table public.wire_o_durchmesser (
  id                uuid primary key default gen_random_uuid(),
  blockstaerke_min  numeric(6,2) not null,
  blockstaerke_max  numeric(6,2) not null,
  teilung           text not null check (teilung in ('3:1', '2:1')),
  durchmesser_zoll  text,
  durchmesser_mm    numeric(6,2),
  bruch_ganzzahl    integer,
  bruch_oben        integer,
  bruch_unten       integer,
  bezeichnung       text,
  xano_ref          text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index wire_o_durchmesser_lookup_idx
  on public.wire_o_durchmesser (teilung, blockstaerke_max);

do $$
declare t text;
begin
  foreach t in array array['material_rolle', 'material', 'wire_o_durchmesser'] loop
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
