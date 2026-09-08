-- ============================================================================
-- Maschinen spezifizieren + automatische Batch→Maschine-Zuordnung.
--
-- Gruppe = maschine.typ ('druck' …). Innerhalb der Gruppe Druck unterscheiden
-- sich die Maschinen nach:
--   druckverfahren  digital (aus flux /printers ladbar) | offset
--   max_farben      1 = einfarbig, 4 = vierfarbig  (Job darf ≤ max_farben brauchen)
--   formate[]       unterstützte Druckbogen (leer = alle)
--   geladenes_papier / geladenes_format   aktuell gerüstet (Rüstzustand)
--
-- Ein Druck-Batch (druckverfahren, druckbogen, papier, Job-Farbigkeit) wird
-- darüber automatisch der passenden Maschine zugeordnet – Rüstzustand gewinnt.
-- ============================================================================

alter table public.maschine
  add column if not exists druckverfahren   text
    check (druckverfahren in ('digital', 'offset')),
  add column if not exists max_farben       smallint,
  add column if not exists formate          text[] not null default '{}',
  add column if not exists geladenes_papier text,
  add column if not exists geladenes_format text;

-- Wurde die Maschine automatisch gesetzt? Dann darf die Auto-Zuordnung sie
-- wieder ändern; eine manuell im Board gesetzte Maschine bleibt.
alter table public.batch
  add column if not exists maschine_auto boolean not null default false;

-- Startbestand konkretisieren.
update public.maschine set druckverfahren = 'digital', max_farben = 4
  where name = 'Digitaldruck' and druckverfahren is null;
update public.maschine set druckverfahren = 'offset', max_farben = 4
  where name = 'Offset' and druckverfahren is null;
