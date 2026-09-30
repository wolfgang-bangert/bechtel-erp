-- Manueller Beleg-Upload auf /eingangsrechnungen soll dieselbe KI-Extraktion
-- anstoßen wie der Mailabruf - web kann das nicht selbst ausführen (Anthropic-
-- Call läuft nur im sync-Container), daher über sync_request wie bei
-- fints:pull/portal:pull.
alter table public.sync_request drop constraint if exists sync_request_job_check;
alter table public.sync_request add constraint sync_request_job_check
  check (job in ('fints:pull', 'portal:pull', 'incoming:extract'));
