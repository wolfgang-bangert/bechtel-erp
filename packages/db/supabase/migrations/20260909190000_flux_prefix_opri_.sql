-- prefix als fester Tag "opri_" (5 Zeichen inkl. Unterstrich) – wie das
-- am 2026-09-09 mittags erzeugte flux-Beispiel opri_666331295_00001.
update public.setting
set value = jsonb_set(value, '{prefix}', '"opri_"'::jsonb, true)
where key = 'flux_createorder_base';
