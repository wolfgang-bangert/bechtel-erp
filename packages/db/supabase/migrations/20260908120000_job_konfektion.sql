-- Job-Typ „konfektion" (z.B. Multiloft: Cover + Inlay + Cover stapeln, Nutzen schneiden).
alter table public.job  drop constraint if exists druckjob_typ_check;
alter table public.job  drop constraint if exists job_typ_check;
alter table public.job  add  constraint job_typ_check
  check (typ in ('druck','cello','binden','aufhaenger','konfektion','sonstige'));
alter table public.batch drop constraint if exists druck_batch_typ_check;
alter table public.batch drop constraint if exists batch_typ_check;
alter table public.batch add  constraint batch_typ_check
  check (typ in ('druck','cello','binden','aufhaenger','konfektion','sonstige'));
