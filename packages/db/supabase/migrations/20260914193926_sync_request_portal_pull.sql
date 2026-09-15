-- sync_request.job-Whitelist um 'portal:pull' erweitern (manueller
-- "Aufträge aktualisieren"-Button auf /druckauftraege, analog zum
-- "Banken aktualisieren"-Button auf /bank).
alter table public.sync_request drop constraint if exists sync_request_job_check;
alter table public.sync_request add constraint sync_request_job_check
  check (job in ('fints:pull', 'portal:pull'));
