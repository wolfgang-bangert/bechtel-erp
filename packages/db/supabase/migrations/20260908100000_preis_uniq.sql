-- Spiralbooklet-Preise teilen sich spalten_key über Formate/Sub-Spalten:
-- der Unique-Key muss Kategorie/Format/Sorte einschließen.
alter table public.preis drop constraint if exists preis_liste_id_spalten_key_auflage_key;
create unique index if not exists preis_uniq
  on public.preis (liste_id, kategorie, coalesce(format, ''), spalten_key, coalesce(sorte, ''), auflage);
