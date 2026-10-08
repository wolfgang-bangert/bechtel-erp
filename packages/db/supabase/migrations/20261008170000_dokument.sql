-- ============================================================================
-- Dokumentablage für Papierdokumente ohne Buchungsbezug (Handwerker-Rapporte,
-- Lieferscheine, Verträge, Sonstiges) - typischerweise mit dem Handy über
-- /scannen erfasst. Eingangsrechnungen laufen NICHT hier rein, sondern wie
-- bisher über incoming_document (KI-Extraktion, Buchung).
--
-- Die PDF liegt im S3-Speicher unter dokumente/<Jahr>/<uuid>.pdf.
-- organization_id wird gesetzt, wenn der eingegebene Firmenname eindeutig
-- einer Organisation entspricht; partner_name behält immer die Eingabe.
-- ============================================================================

create table if not exists public.dokument (
  id               uuid primary key default gen_random_uuid(),
  kategorie        text not null default 'sonstiges'
                     check (kategorie in ('rapport', 'lieferschein', 'vertrag', 'sonstiges')),
  titel            text not null,
  dokument_datum   date,
  partner_name     text,
  organization_id  uuid references public.organization (id) on delete set null,
  notiz            text,
  file_name        text,
  storage_key      text not null,
  file_sha256      text,
  seiten           integer,
  quelle           text not null default 'scan' check (quelle in ('scan', 'upload')),
  erfasst_von      uuid references public.app_user (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists dokument_kategorie_idx on public.dokument (kategorie, created_at desc);
create index if not exists dokument_organization_idx on public.dokument (organization_id);
create index if not exists dokument_sha256_idx on public.dokument (file_sha256);

select public.attach_standard_triggers('public.dokument'::regclass);
alter table public.dokument enable row level security;

drop policy if exists dokument_read on public.dokument;
create policy dokument_read on public.dokument for select using (public.is_staff());
drop policy if exists dokument_write on public.dokument;
create policy dokument_write on public.dokument for all
  using (public.has_any_role(array['admin','office','accounting','production']::app_role[]))
  with check (public.has_any_role(array['admin','office','accounting','production']::app_role[]));
