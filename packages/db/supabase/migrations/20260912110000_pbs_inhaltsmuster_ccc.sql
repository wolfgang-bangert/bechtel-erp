-- ============================================================================
-- PBS-Inhaltsmuster: zweite beobachtete SKU-Form "Z<Format>CCC.<Code>" (z.B.
-- "ZBSA5CCC.CKA") neben "Z<Format>50C.<Code>" - betraf 4 von 16 offenen
-- Aufträgen, kein Einzelfall. Gleiche Bedeutung, eigene opri_sku-Zeilen (Match
-- ist exakt, kein Wildcard für den mittleren Codeblock).
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
        format('ZBS%sCCC.%s', fmt.prefix, code.suffix),
        format('ZBS%sCCC%s', fmt.prefix, code.suffix),
        'option',
        'PBS',
        format('ZBS%sCCC', fmt.prefix),
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
