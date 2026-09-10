-- Kurz-Abkürzung je Produktgruppe für den flux-Titel (der Originalname ist
-- zu lang). z.B. Wandkalender → "WK".
alter table public.opri_produkt_gruppe
  add column if not exists titel_kuerzel text;
