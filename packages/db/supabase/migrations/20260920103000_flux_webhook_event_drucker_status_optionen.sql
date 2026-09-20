-- Status-Unteroptionen für "Drucker: Status geändert" nachgetragen (aus der
-- flux-UI, war beim ersten Katalog-Import übersehen - nicht nur
-- "Druckauftrag: Status geändert" hat Unteroptionen).
update public.flux_webhook_event
set status_optionen = array[
  'Drucker ist bereit',
  'Druckerfehler',
  'Druckerstatus unbekannt',
  'Drucker druckt',
  'Drucker wärmt auf',
  'Kein Druckerstatus verfügbar',
  'Drucker ist offline'
]
where key = 'drucker_status_geaendert';
