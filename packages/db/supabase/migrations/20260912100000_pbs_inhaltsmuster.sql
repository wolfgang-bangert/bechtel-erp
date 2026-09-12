-- ============================================================================
-- PBS: Inhaltsmuster-Option (kariert/liniert/blanko/4-farbig) aus onlineprinters
-- registrieren und die Inhalt-Materialregel danach verzweigen. Kariert/liniert/
-- blanko sind vorgedruckt auf Lager (Katalog aus 20260912090000), nur bei
-- "4-farbig" wird der Inhalt tatsächlich gedruckt (bisheriges Verhalten).
--
-- SKU-Muster (aus echten Aufträgen): Z<Formatpräfix>50C.<Code>, z.B.
-- "ZBSA550C.CKA" (A5, kariert). Formatpräfixe: A4, A5, DL, Q4 (A4-Quadrat),
-- Q5 (A5-Quadrat, noch ohne Bestellung – vorsorglich mit angelegt).
-- ============================================================================

do $$
declare
  fmt record;
  code record;
begin
  for fmt in
    select * from (values ('A4'), ('A5'), ('DL'), ('Q4'), ('Q5')) as f(prefix)
  loop
    for code in
      select * from (values
        ('CKA', 'kariert, einfarbig'),
        ('CLI', 'liniert, einfarbig'),
        ('CUB', 'unbedruckt'),
        ('C44', '4-farbig')
      ) as c(suffix, label)
    loop
      insert into public.opri_sku
        (sku, sku_norm, typ, gruppe_kuerzel, option_typ_sku, option_typ_name, wert_name, bezeichnung, attribute, sheet, is_active)
      values (
        format('ZBS%s50C.%s', fmt.prefix, code.suffix),
        format('ZBS%s50C%s', fmt.prefix, code.suffix), -- sku_norm: Punkt entfernt (norm() in resolve.ts)
        'option',
        'PBS',
        format('ZBS%s50C', fmt.prefix),
        'Inhaltsmuster (Blöcke mit Spiralbindung)',
        code.label,
        code.label,
        '{}'::jsonb,
        'Blöcke mit Spiralbindung',
        true
      )
      on conflict do nothing;
    end loop;
  end loop;
end $$;

-- Bisherige Regel nur noch für "4-farbig" (= tatsächlich gedruckter Inhalt)
update public.opri_material_regel
set bedingung = jsonb_build_object('muster', 'vierfarbig')
where name = 'PBS-Inhalt 80g Offset';

-- Vorgedruckter Inhalt (Lager) für die anderen drei Muster
insert into public.opri_material_regel
  (name, ebene, gruppe_id, modus, material_rolle, verwendung, herkunft, mengen_formel,
   produktionshinweis, zaehlt_zur_blockstaerke, bedruckt, prio, is_active, einheit,
   traegt_cello, bedingung)
select
  'PBS-Inhalt vorgedruckt ' || m.muster,
  'gruppe',
  r.gruppe_id,
  'hinzufuegen',
  'Vorgedruckter Inhalt',
  'Inhalt',
  'aus_format',
  'auflage*blatt',
  'Vorgedruckt auf Lager (' || m.muster || '), nicht je Auftrag gedruckt',
  true,
  false,
  100,
  true,
  'bogen',
  false,
  jsonb_build_object('muster', m.muster)
from public.opri_material_regel r,
     (values ('kariert'), ('liniert'), ('blanko')) as m(muster)
where r.name = 'PBS-Inhalt 80g Offset'
on conflict do nothing;
