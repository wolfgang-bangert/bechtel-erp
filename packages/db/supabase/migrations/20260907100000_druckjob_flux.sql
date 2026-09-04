-- Druckjob: flux-Felder aus dem Template + Papiersorte aus dem Materialkatalog.
alter table public.druckjob add column if not exists flux_paper_type text;
alter table public.druckjob add column if not exists flux_signature  text;
alter table public.druckjob add column if not exists flux_printer    text;
