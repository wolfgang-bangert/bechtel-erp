-- flux verlangt prefix ≤ 5 Zeichen, nur A-Z/0-9. Fester Kurz-Tag im Base-Setting.
update public.setting
set value = jsonb_set(value, '{prefix}', '"OPRI"'::jsonb, true)
where key = 'flux_createorder_base';
