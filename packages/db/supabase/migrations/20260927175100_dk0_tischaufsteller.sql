-- DK0 (Wochentischkalender) fehlte die Tischaufsteller-Regel, die DKL
-- (Tischkalender) schon hat - beide sind Tisch-Kalender mit Aufsteller,
-- die Regel für DK0 wurde beim Anlegen schlicht vergessen.
-- Exakte Kopie von "DKL-Tischaufsteller", nur Name + Gruppe angepasst.
insert into public.opri_material_regel
  (name, ebene, gruppe_id, material_rolle, verwendung, herkunft, mengen_formel,
   produktionshinweis, zaehlt_zur_blockstaerke, prio, is_active, einheit, traegt_cello)
select
  'DK0-Tischaufsteller', 'gruppe', g.id, 'Pappaufsteller', 'Aufsteller', 'aus_format', 'auflage',
  'Tischaufsteller je Kalenderformat', true, 100, true, 'stück', false
from public.opri_produkt_gruppe g
where g.kuerzel = 'DK0'
  and not exists (select 1 from public.opri_material_regel where name = 'DK0-Tischaufsteller');
