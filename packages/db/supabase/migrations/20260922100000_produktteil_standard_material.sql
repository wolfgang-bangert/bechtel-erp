-- Standard-Material für Produktteile: alle Teile 200g Bilderdruck matt,
-- Ausnahme Inhalt-Teile (100g Bilderdruck matt). Gilt produktübergreifend,
-- damit auch künftige Kopien mit diesem Standard starten. material.name hat
-- keinen Unique-Index, daher erst prüfen statt "on conflict".
do $$
declare
  v_200 uuid;
  v_100 uuid;
begin
  select id into v_200 from public.material where name = '200g Bilderdruck matt';
  if v_200 is null then
    insert into public.material (name, attribute)
      values ('200g Bilderdruck matt', '{"grammatur_g": 200, "oberflaeche": "matt", "sorte": "Bilderdruck"}'::jsonb)
      returning id into v_200;
  end if;

  select id into v_100 from public.material where name = '100g Bilderdruck matt';
  if v_100 is null then
    insert into public.material (name, attribute)
      values ('100g Bilderdruck matt', '{"grammatur_g": 100, "oberflaeche": "matt", "sorte": "Bilderdruck"}'::jsonb)
      returning id into v_100;
  end if;

  update public.produktteil set material_id = v_100 where typ = 'inhalt';
  update public.produktteil set material_id = v_200 where typ != 'inhalt';
end $$;
