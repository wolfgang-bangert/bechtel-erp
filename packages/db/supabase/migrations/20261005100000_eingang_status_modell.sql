-- Eingangsrechnungen: Statusmodell vereinfacht.
--  * "geprüft" (reviewed) entfällt als eigener Buchungsstand: wer kontrolliert hat, setzt "gebucht" (booked).
--    Bestehende geprüfte Belege werden zu gebucht, damit UStVA/DATEV unverändert bleiben.
--  * "von Kollegen gesehen" ist ein eigener, vom Buchungsstand unabhängiger Vermerk (wer und wann).
alter table public.incoming_document
  add column if not exists colleague_checked_at timestamptz,
  add column if not exists colleague_checked_by uuid references public.app_user (id);

update public.incoming_document set status = 'booked' where status = 'reviewed';
