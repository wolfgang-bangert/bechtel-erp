-- ============================================================================
-- Batch-Gruppierung konfigurierbar: je job.typ eine Liste von Feldern, aus denen
-- der Batch-Schlüssel gebaut wird. Bearbeitbar unter /einstellungen/batch-gruppierung.
-- Binde-Batches werden künftig nach Bindeseite · Schlaufen · Spiralfarbe ·
-- Teilung · Durchmesser gruppiert.
-- ============================================================================

alter table public.job add column if not exists spiralfarbe text;

insert into public.setting (key, value, scope) values (
  'batch_gruppierung',
  jsonb_build_object(
    'druck',      jsonb_build_array('verfahren', 'cello', 'papier', 'druckbogen'),
    'cello',      jsonb_build_array('bauteil', 'cello', 'papier'),
    'binden',     jsonb_build_array('bindeseite', 'schlaufen', 'spiralfarbe', 'teilung', 'durchmesser'),
    'konfektion', jsonb_build_array('format', 'druckbogen')
  ),
  'company'
)
on conflict (key) do update set value = excluded.value;
