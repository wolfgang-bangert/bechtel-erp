-- ============================================================================
-- Maschinen-Fähigkeiten: was eine Maschine kann, als Attribut-Set (analog zu
-- Produkt-Attributen).
--
--   Tätigkeit  = maschine.typ  (Drucken, Binden, Cellophanieren, Konfektion)
--   Fähigkeit  = Schlüssel + Wert je Maschine
--
--   faehigkeit            Katalog der Fähigkeits-Schlüssel (+ Art des Werts)
--   maschine_faehigkeit   Wert je Maschine
--
-- Auswertung (Auftrag → passende Maschinen) kommt später; hier nur Modell + UI.
-- ============================================================================

create table public.faehigkeit (
  key         text primary key,
  label       text not null,
  taetigkeit  text not null default 'alle'
              check (taetigkeit in ('alle', 'druck', 'cello', 'binden', 'konfektion', 'sonstige')),
  art         text not null check (art in ('liste', 'max', 'min', 'flag', 'text')),
  einheit     text,
  optionen    text[] not null default '{}',   -- erlaubte Werte bei art = 'liste'
  sortierung  integer not null default 100,
  notiz       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.maschine_faehigkeit (
  maschine_id    uuid not null references public.maschine (id) on delete cascade,
  faehigkeit_key text not null references public.faehigkeit (key) on delete cascade,
  wert           jsonb not null,              -- number | boolean | string | string[]
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (maschine_id, faehigkeit_key)
);
create index maschine_faehigkeit_key_idx on public.maschine_faehigkeit (faehigkeit_key);

-- ---------------------------------------------------------------- Trigger + RLS
do $$
declare t text;
begin
  foreach t in array array['faehigkeit', 'maschine_faehigkeit'] loop
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

-- ---------------------------------------------------------------- Katalog-Start
insert into public.faehigkeit (key, label, taetigkeit, art, einheit, optionen, sortierung) values
  ('formate',                    'Formate',                     'alle',   'liste', null,   array['SRA3','SRA3+','B2','A3','A2'], 10),
  ('verfahren',                  'Druckverfahren',              'druck',  'liste', null,   array['digital','offset'],           20),
  ('druckfarben_max',            'max. Druckfarben',            'druck',  'max',   null,   '{}',                                30),
  ('grammatur_min',              'Grammatur min.',              'druck',  'min',   'g/m²', '{}',                                40),
  ('grammatur_max',              'Grammatur max.',              'druck',  'max',   'g/m²', '{}',                                50),
  ('kartondruck',                'Karton bedruckbar',           'druck',  'flag',  null,   '{}',                                60),
  ('duplex',                     'Duplex (Schön- und Widerdruck)','druck','flag',  null,   '{}',                                70),
  ('weiss_sonderfarbe',          'Weiß / Sonderfarbe',          'druck',  'flag',  null,   '{}',                                80),
  ('teilungen',                  'Wire-O Teilungen',            'binden', 'liste', null,   array['2:1','3:1'],                  90),
  ('durchmesser_max',            'max. Bindungsdurchmesser',    'binden', 'max',   'mm',   '{}',                               100),
  ('blockdicke_max',             'max. Blockdicke',             'binden', 'max',   'mm',   '{}',                               110),
  ('kalenderaufhaenger_montage', 'Kalenderaufhänger montieren', 'binden', 'flag',  null,   '{}',                               120),
  ('folien',                     'Cello-Folien',                'cello',  'liste', null,   array['matt','glanz','soft-touch'], 130),
  ('seiten_max',                 'max. Cello-Seiten',           'cello',  'max',   null,   '{}',                               140);
