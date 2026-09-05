-- Multiloft & Wandkalender unterscheiden 4/4 vs 4/0 nur über farbigkeit –
-- der Unique-Key muss das mit abdecken.
drop index if exists public.preis_uniq;
create unique index preis_uniq on public.preis (
  liste_id, kategorie, coalesce(format, ''), spalten_key,
  coalesce(sorte, ''), coalesce(farbigkeit, ''), auflage
);
