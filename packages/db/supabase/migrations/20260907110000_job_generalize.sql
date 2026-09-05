-- ============================================================================
-- druckjob → job, druck_batch → batch: allgemeine Arbeitsvorgänge.
--   typ: druck | cello | binden | aufhaenger | sonstige
-- Druck-Jobs gehen an flux; cello/binden/aufhaenger sind werk-interne Schritte.
-- abhaengig_von hält die Reihenfolge (Cello nach Umschlag-Druck, Binden nach
-- allen Druck-/Cello-Jobs des Auftrags) für ein späteres Planungsboard.
-- ============================================================================

-- Testdaten aus der druckjob-Phase verwerfen (materialize.ts ist reproduzierbar).
delete from public.druckjob;
delete from public.druck_batch;

alter table public.druckjob   rename to job;
alter table public.druck_batch rename to batch;

alter table public.job
  add column if not exists typ text not null default 'druck'
    check (typ in ('druck', 'cello', 'binden', 'aufhaenger', 'sonstige')),
  add column if not exists abhaengig_von uuid[] not null default '{}',
  -- Binde-Attribute (aus der Wire-O-Materialzeile)
  add column if not exists teilung          text,
  add column if not exists durchmesser      text,
  add column if not exists schlaufen        integer,
  add column if not exists schlaufen_gesamt integer,
  add column if not exists bindeseite       text;

-- Jobs müssen nicht aus einem Portal-Auftrag stammen (spätere Hausaufträge).
alter table public.job alter column portal_order_id drop not null;

alter table public.batch
  add column if not exists typ text not null default 'druck'
    check (typ in ('druck', 'cello', 'binden', 'aufhaenger', 'sonstige'));

create index if not exists job_typ_idx on public.job (typ);
create index if not exists batch_typ_idx on public.batch (typ);

-- Nummernkreis-Key umbenennen (Batch-Nummern DB-… bleiben).
update public.number_sequence set key = 'batch' where key = 'druck_batch';
