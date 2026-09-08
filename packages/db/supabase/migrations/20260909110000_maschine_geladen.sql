-- ============================================================================
-- Digitaldruckmaschinen können mehrere Materialien/Formate gleichzeitig
-- gerüstet haben (bis zu 9 Magazine). Statt eines einzelnen geladenen
-- Papiers/Formats: Liste geladen[] = [{ papier, format }, …].
-- ============================================================================

alter table public.maschine
  add column if not exists geladen jsonb not null default '[]'::jsonb;

-- Bestehenden Einzelwert übernehmen.
update public.maschine
  set geladen = jsonb_build_array(
    jsonb_build_object('papier', geladenes_papier, 'format', coalesce(geladenes_format, ''))
  )
  where geladenes_papier is not null
    and geladen = '[]'::jsonb;

alter table public.maschine
  drop column if exists geladenes_papier,
  drop column if exists geladenes_format;
