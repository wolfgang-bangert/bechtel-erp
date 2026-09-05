-- ============================================================================
-- Preislisten (Schwabenprint / IVS Abele) + wöchentliche Abrechnung gegenüber
-- OnlinePrinters.
--
--   preis_liste  – zeitraum-gültige Ausgabe (gueltig_ab / gueltig_bis; NULL = offen)
--   preis        – ein Preispunkt: Kategorie · Format · Blatt · Sorte · Auflage
--   portal_order – zusätzliche Felder: Versanddatum, Preis-Snapshot, berechnet,
--                  Rekla-Kennzeichen + Vermerk, Abrechnungs-Zuordnung
--   abrechnung / abrechnung_position – je Kalenderwoche, eine Zeile je Auftrag
-- ============================================================================

create table public.preis_liste (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  lieferant         text,                       -- Herkunft der Liste (Schwabenprint / IVS Abele)
  waehrung          char(3) not null default 'EUR',
  gueltig_ab        date not null,
  gueltig_bis       date,                        -- NULL = unbefristet
  basis_liste_id    uuid references public.preis_liste (id) on delete set null,
  aufschlag_prozent numeric(6,3) not null default 0,   -- so wurde diese Liste aus basis abgeleitet
  is_active         boolean not null default true,
  notiz             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.preis (
  id             uuid primary key default gen_random_uuid(),
  liste_id       uuid not null references public.preis_liste (id) on delete cascade,
  kategorie      text not null,                  -- 'Tischkalender', 'Wandkalender', 'Speisekarte', …
  produktgruppe  text,                           -- 'DKL','DWK','DSP',… (Resolver-Kürzel)
  format         text,                           -- 'A5'
  blatt          integer,                        -- 13
  sorte          text,                           -- '170','250OFF','BD glz. 300g/m²' …
  farbigkeit     text,                           -- '4/0','4/4' (nur wo relevant)
  spalten_key    text not null,                  -- Rohkey aus dem Sheet ('A513170')
  auflage        integer not null,               -- exakte Auflage
  preis_netto    numeric(12,4) not null,
  notiz          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (liste_id, spalten_key, auflage)
);
create index preis_lookup_idx
  on public.preis (liste_id, kategorie, format, blatt, sorte, farbigkeit, auflage);

create table public.abrechnung (
  id                 uuid primary key default gen_random_uuid(),
  jahr               integer not null,
  kw                 integer not null check (kw between 1 and 53),
  von                date not null,
  bis                date not null,
  status             text not null default 'offen' check (status in ('offen', 'festgeschrieben')),
  summe_netto        numeric(14,2) not null default 0,
  festgeschrieben_at timestamptz,
  notiz              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (jahr, kw)
);

create table public.abrechnung_position (
  id              uuid primary key default gen_random_uuid(),
  abrechnung_id   uuid not null references public.abrechnung (id) on delete cascade,
  portal_order_id uuid references public.portal_order (id) on delete set null,
  referenz        text,                          -- Snapshot external_reference
  bezeichnung     text,
  kategorie       text,
  format          text,
  blatt           integer,
  auflage         integer,
  preis_netto     numeric(12,4),                 -- Einzelpreis-Snapshot
  betrag_netto    numeric(14,2) not null default 0,
  ist_rekla       boolean not null default false,
  rekla_vermerk   text,
  manuell         boolean not null default false,  -- Betrag von Hand gesetzt (Teilschuld)
  notiz           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index abrechnung_position_idx on public.abrechnung_position (abrechnung_id);
create index abrechnung_position_order_idx on public.abrechnung_position (portal_order_id);

-- ---- portal_order: Versand, Preis, Abrechnung ----------------------------
alter table public.portal_order
  add column if not exists versand_datum  date,
  add column if not exists preis_id       uuid references public.preis (id) on delete set null,
  add column if not exists preis_netto    numeric(12,2),
  add column if not exists preis_quelle   text check (preis_quelle in ('auto', 'manuell', 'kein_treffer')),
  add column if not exists berechnet      boolean not null default true,
  add column if not exists ist_rekla      boolean not null default false,
  add column if not exists rekla_vermerk  text,
  add column if not exists abrechnung_id  uuid references public.abrechnung (id) on delete set null;
create index if not exists portal_order_versand_idx on public.portal_order (versand_datum);
create index if not exists portal_order_abrechnung_idx on public.portal_order (abrechnung_id);

-- ---- Trigger + RLS ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['preis_liste', 'preis', 'abrechnung', 'abrechnung_position'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','accounting']::app_role[]))
        with check (public.has_any_role(array['admin','office','accounting']::app_role[]));
    $f$, t);
  end loop;
end $$;
