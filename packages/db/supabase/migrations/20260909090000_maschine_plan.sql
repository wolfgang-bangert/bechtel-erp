-- ============================================================================
-- Maschinen + Plan-Zuordnung: Grundlage für das Kanban-/Belegungs-Board.
--
--   maschine            physische Station (Druck, Cello, Binden, Konfektion)
--   batch.maschine_id   Batch läuft auf dieser Maschine (NULL = noch nicht geplant)
--   batch.dauer_minuten geschätzte/erfasste Rüst- + Laufzeit (fürs Board)
--   batch.plan_reihenfolge  Reihenfolge innerhalb der Maschinen-Spalte
--
-- Das Board bucketet batch.status in Phasen (Warteschlange / Läuft / Fertig)
-- und legt die Batches als Karten in die Spalte ihrer Maschine.
-- ============================================================================

create table public.maschine (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  typ                text not null
                     check (typ in ('druck', 'cello', 'binden', 'konfektion', 'sonstige')),
  flux_printer_name  text,                 -- Name aus flux /printers (nur Druck)
  farbe              text,                 -- Hex für die Board-Spalte
  kapazitaet_bogen_h integer,              -- grobe Leistung für Dauer-Schätzung
  sortierung         integer not null default 100,
  aktiv              boolean not null default true,
  notiz              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index maschine_typ_idx on public.maschine (typ) where aktiv;

alter table public.batch
  add column if not exists maschine_id      uuid references public.maschine (id) on delete set null,
  add column if not exists dauer_minuten    integer,
  add column if not exists plan_reihenfolge integer;
create index if not exists batch_maschine_idx on public.batch (maschine_id);

-- ---------------------------------------------------------------- Trigger + RLS
select public.attach_standard_triggers('public.maschine'::regclass);
alter table public.maschine enable row level security;
create policy maschine_read on public.maschine for select using (public.is_staff());
create policy maschine_write on public.maschine for all
  using (public.has_any_role(array['admin', 'office', 'production']::app_role[]))
  with check (public.has_any_role(array['admin', 'office', 'production']::app_role[]));

-- ---------------------------------------------------------------- Startbestand
-- Namen/Farben in /einstellungen/maschinen anpassbar.
insert into public.maschine (name, typ, farbe, sortierung) values
  ('Offset',                'druck',      '#2f6feb', 10),
  ('Digitaldruck',          'druck',      '#7b3fe4', 20),
  ('Cellophaniermaschine',  'cello',      '#e08a1e', 30),
  ('Wire-O-Bindung',        'binden',     '#157f3b', 40),
  ('Konfektion',            'konfektion', '#6b6b73', 50)
on conflict (name) do nothing;
