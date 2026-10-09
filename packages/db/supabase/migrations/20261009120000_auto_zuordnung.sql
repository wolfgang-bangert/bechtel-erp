-- ============================================================================
-- Automatische Zuordnung von Dokumenten und Eingangsrechnungen.
--
-- * organization.angelegt_durch: woher eine automatisch angelegte Organisation
--   stammt ('eingangsrechnung' / 'dokument'); null = von Hand oder aus
--   Keyline/Ninox. Filter "automatisch angelegt" unter /organisationen, um sie
--   zu prüfen und Dubletten über den Warenkorb zu verschmelzen.
-- * dokument.extraktion_*: KI-Erkennung im sync-Container (dokumente:extract)
--   liest Partner, Datum, Titel und ordnet Organisation bzw. Person zu.
-- ============================================================================

alter table public.organization
  add column if not exists angelegt_durch text check (angelegt_durch in ('eingangsrechnung', 'dokument'));
create index if not exists organization_angelegt_durch_idx on public.organization (angelegt_durch)
  where angelegt_durch is not null;

alter table public.dokument
  add column if not exists extraktion_status text not null default 'offen'
    check (extraktion_status in ('offen', 'fertig', 'fehler')),
  add column if not exists extraktion_fehler text,
  add column if not exists extrahiert_at timestamptz,
  add column if not exists ki_daten jsonb;
create index if not exists dokument_extraktion_offen_idx on public.dokument (created_at)
  where extraktion_status = 'offen';

-- Neue Dokumente stoßen die Erkennung sofort an (sync_request "dokumente:extract")
alter table public.sync_request drop constraint if exists sync_request_job_check;
alter table public.sync_request add constraint sync_request_job_check
  check (job in ('fints:pull', 'portal:pull', 'incoming:extract', 'dokumente:extract'));

-- Scannen/Hochladen dürfen auch Buchhaltung-Nutzer - die müssen die Erkennung auch anstoßen können
drop policy if exists sync_request_write on public.sync_request;
create policy sync_request_write on public.sync_request for all
  using (public.has_any_role(array['admin','office','production','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','office','production','accounting']::app_role[]));
