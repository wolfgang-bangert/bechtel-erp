-- ============================================================================
-- PBS (Schreibblöcke mit Spiralbindung): Inhalt kariert/blanko/liniert wird
-- nicht je Auftrag bedruckt, sondern vorgedruckt auf Lager gehalten - wie ein
-- Tischaufsteller (eigene material_rolle, Zuordnung später über eine
-- Materialregel "aus_format", analog DKL-Tischaufsteller).
--
-- 3 Muster × 2 Blattzahlen × 5 Formate = 30 Katalog-Materialien.
-- Produktstärke (dicke_mm) bewusst nicht gesetzt - wird in der UI ergänzt.
-- ============================================================================

insert into public.material_rolle (name, sort)
values ('Vorgedruckter Inhalt', 60)
on conflict (name) do nothing;

do $$
declare
  rolle uuid;
  muster record;
  fmt record;
  blatt integer;
begin
  select id into rolle from public.material_rolle where name = 'Vorgedruckter Inhalt';

  for muster in
    select * from (values ('KARIERT', 'kariert'), ('BLANKO', 'blanko'), ('LINIERT', 'liniert'))
      as m(label, attr)
  loop
    for fmt in
      select * from (values ('A5', 'A5'), ('A4', 'A4'), ('DIN lang', 'DL'),
                             ('A5-Quadrat', 'A5-Quadrat'), ('A4-Quadrat', 'A4-Quadrat'))
        as f(label, code)
    loop
      foreach blatt in array array[50, 100]
      loop
        insert into public.material (name, rolle_id, attribute, is_active)
        values (
          format('Inhalt für Spiralblöcke %s %s (%s Blatt 80g Offset mit Kartonrückwand)',
                 muster.label, fmt.label, blatt),
          rolle,
          jsonb_build_object(
            'Funktion', 'Spiralblock-Inhalt',
            'Muster', muster.attr,
            'Format', fmt.code,
            'Blatt', blatt,
            'Sorte', 'Offset',
            'Grammatur_g', '80'
          ),
          true
        )
        on conflict do nothing;
      end loop;
    end loop;
  end loop;
end $$;
