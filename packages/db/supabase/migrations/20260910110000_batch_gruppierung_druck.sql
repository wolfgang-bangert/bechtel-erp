-- Druck-Batches wieder aktiv: gruppiert nach Bindelänge · Spiralfarbe · Durchmesser
-- (aus der Wire-O-Zeile des Auftrags).
update public.setting
set value = jsonb_set(
  value, '{druck}',
  jsonb_build_array('bindelaenge', 'spiralfarbe', 'durchmesser')
)
where key = 'batch_gruppierung';
