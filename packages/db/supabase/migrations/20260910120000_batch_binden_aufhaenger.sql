-- Binde-Batches zusätzlich nach Kalenderaufhänger trennen (¼" vs. ¼" mit Aufhänger).
update public.setting
set value = jsonb_set(
  value, '{binden}',
  jsonb_build_array('schlaufen', 'spiralfarbe', 'aufhaenger', 'teilung', 'durchmesser')
)
where key = 'batch_gruppierung';
