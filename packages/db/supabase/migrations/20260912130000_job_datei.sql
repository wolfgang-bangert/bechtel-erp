-- ============================================================================
-- Dateien je Arbeitsvorgang (job): mehrere PDFs pro Druck-Job statt nur einem
-- pdf_storage_key. herkunft='auto' = von erzeugeJobs aus der Auflösung
-- gesetzt (Druckdaten bzw. Umschlag/Inhalt-Teil), 'upload' = manuell über
-- die Arbeitsvorgänge-Ansicht ergänzt oder als Ersatz hochgeladen. Alle
-- Zeilen einer job_id gehen als pageSources mit an flux.
-- ============================================================================

create table public.job_datei (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.job (id) on delete cascade,
  storage_key text not null,
  filename    text,
  bytes       bigint,
  herkunft    text not null default 'auto' check (herkunft in ('auto', 'upload')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index job_datei_job_idx on public.job_datei (job_id);

select public.attach_standard_triggers('public.job_datei'::regclass);
alter table public.job_datei enable row level security;
create policy job_datei_read on public.job_datei for select using (public.is_staff());
create policy job_datei_write on public.job_datei for all
  using (public.has_any_role(array['admin','office','production']::app_role[]))
  with check (public.has_any_role(array['admin','office','production']::app_role[]));

-- Bestehende Druckjobs: den bisher einzelnen pdf_storage_key als 'auto'-Datei
-- übernehmen, damit nichts verloren geht.
insert into public.job_datei (job_id, storage_key, herkunft)
select id, pdf_storage_key, 'auto'
from public.job
where pdf_storage_key is not null;
