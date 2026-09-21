-- ============================================================================
-- Produktstruktur (Stufe 1: Handbuch-Produkte mit Registern)
--
--   produkt          ein Produkt je Sprachversion (z.B. IMPULS-VKHB italienisch)
--   produkt_kapitel  alles ab einem Unterregister bis zum nächsten
--   produktteil      Bauteil eines Produkts (Hauptregister, Unterregister,
--                    Inhalt, Deckblatt ...); Unterregister + Inhalt bilden
--                    zusammen ein Kapitel
--   produktteil_datei zugehörige (Einzel-)PDFs je Produktteil
--
-- Bewusst eigenständig (keine FKs auf Aufträge/opri/Preise): dient dazu, am
-- konkreten Fall zu lernen, bevor die zentrale Produktstruktur festgelegt wird.
-- Registergröße wird berechnet (packages/shared/src/produkt/register.ts).
-- ============================================================================

create table public.produktteil_typ (
  key           text primary key,
  label         text not null,
  hat_register  boolean not null default false,
  sortierung    integer not null default 100
);

insert into public.produktteil_typ (key, label, hat_register, sortierung) values
  ('deckblatt',       'Deckblatt',        false, 10),
  ('faltblatt',       'Faltblatt',        false, 20),
  ('verkaufshandbuch','Verkaufshandbuch', false, 30),
  ('hauptregister',   'Hauptregister',    true,  40),
  ('unterregister',   'Unterregister',    true,  50),
  ('inhalt',          'Inhalt',           false, 60),
  ('sonderseiten',    'Sonderseiten',     false, 70);

create table public.produkt (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  art           text not null default 'handbuch',
  sprache       text,
  beschreibung  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.produktteil (
  id                    uuid primary key default gen_random_uuid(),
  produkt_id            uuid not null references public.produkt (id) on delete cascade,
  typ                   text not null references public.produktteil_typ (key),
  kapitel_id            uuid,                       -- FK unten (Zirkelbezug)
  hauptregister_teil_id uuid references public.produktteil (id) on delete set null,
  nr                    text,
  titel                 text,
  material_id           uuid references public.material (id) on delete set null,
  farbigkeit            text,                       -- '4/4', '1/1', '4/0' ...
  seitenzahl            integer,
  register_teile        smallint,                   -- z.B. 10 = 10-teiliges Register
  register_position     smallint,                   -- 1..register_teile
  sortierung            integer not null default 100,
  attribute             jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index produktteil_produkt_idx on public.produktteil (produkt_id, sortierung);

create table public.produkt_kapitel (
  id                    uuid primary key default gen_random_uuid(),
  produkt_id            uuid not null references public.produkt (id) on delete cascade,
  nr                    text not null,              -- z.B. '4-11'
  hauptregister_teil_id uuid references public.produktteil (id) on delete set null,
  name                  text not null,              -- geht später an flux
  sortierung            integer not null default 100,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (produkt_id, nr)
);

alter table public.produktteil
  add constraint produktteil_kapitel_fk
  foreign key (kapitel_id) references public.produkt_kapitel (id) on delete set null;

-- je Kapitel genau ein Unterregister- und ein Inhalts-Teil
create unique index produktteil_kapitel_typ_uniq
  on public.produktteil (kapitel_id, typ) where kapitel_id is not null;

create table public.produktteil_datei (
  id            uuid primary key default gen_random_uuid(),
  produktteil_id uuid not null references public.produktteil (id) on delete cascade,
  file_id       uuid not null references public.file (id) on delete cascade,
  reihenfolge   integer not null default 1,
  quelle        text,                               -- Originaldatei, z.B. 'IP_91e'
  seite_von     integer,
  seite_bis     integer,
  created_at    timestamptz not null default now()
);
create index produktteil_datei_teil_idx on public.produktteil_datei (produktteil_id, reihenfolge);

-- ---------------------------------------------------------------- Trigger + RLS
do $$
declare t text;
begin
  foreach t in array array['produkt', 'produktteil', 'produkt_kapitel'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
  end loop;
  foreach t in array array['produktteil_typ', 'produkt', 'produktteil', 'produkt_kapitel', 'produktteil_datei'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','production']::app_role[]))
        with check (public.has_any_role(array['admin','office','production']::app_role[]));
    $f$, t);
  end loop;
end $$;
