-- ============================================================================
-- Versand als eigener Arbeitsvorgang (job.typ = 'versand'), analog zu
-- druck/cello/binden/konfektion. Entsteht automatisch 1x je Auftrag beim
-- "Jobs erzeugen" (volle Auftragsmenge), kann bei Bedarf manuell um weitere
-- Versand-Vorgänge ergänzt werden (Teillieferungen, jeweils eigene Menge).
--
-- Braucht keinen batch_id (Versand wird nicht wie Druck/Cello/Binden
-- auftragsübergreifend nach Kriterien gebündelt - bleibt null).
--
-- Neue Spalten schon jetzt vorbereitet für die spätere Label-/Carrier-
-- Anbindung (analog zum flux-Versand bei Druck-Jobs), auch wenn die
-- eigentliche Erzeugung/Anbindung noch nicht gebaut ist.
-- ============================================================================

alter table public.job drop constraint if exists druckjob_typ_check;
alter table public.job drop constraint if exists job_typ_check;
alter table public.job add  constraint job_typ_check
  check (typ in ('druck', 'cello', 'binden', 'aufhaenger', 'konfektion', 'versand', 'sonstige'));

alter table public.job drop constraint if exists druckjob_status_check;
alter table public.job drop constraint if exists job_status_check;
alter table public.job add  constraint job_status_check
  check (status in (
    'offen', 'in_batch', 'an_flux', 'im_druck', 'gedruckt', 'cellophaniert',
    -- Versand-spezifische Status, Vokabular wie shipment.status:
    'gepackt', 'etikettiert', 'uebergeben', 'zugestellt',
    'fertig', 'storniert'
  ));

alter table public.job
  add column if not exists versand_datum             date,
  add column if not exists versand_carrier_id         uuid references public.carrier (id) on delete set null,
  add column if not exists versand_tracking           text,
  add column if not exists versand_label_storage_key  text;
