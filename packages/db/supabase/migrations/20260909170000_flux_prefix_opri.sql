-- flux baut die Auftragsnummer als <prefix>_<bestnummer>_<lfd. Nr>.
-- Fester Kurz-Tag "opri" (≤ 5 Zeichen); bestnummer trägt die volle Nummer.
update public.setting
set value = jsonb_set(value, '{prefix}', '"opri"'::jsonb, true)
where key = 'flux_createorder_base';
