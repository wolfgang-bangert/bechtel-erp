-- ============================================================================
-- Korrektur zu 20260903100000: ein Junk-Datensatz (organization.name = 'name',
-- customer_number '12312313', supplier_number '21312313') hat die Sequenzen
-- über den sinnvollen Bereich hochgezogen. Legitime Höchstwerte:
-- customer ~98436, supplier ~99216. Sequenzen auf einen sauberen Start
-- oberhalb aller echten Nummern setzen (nächste Nummer = 100001).
-- ============================================================================

update public.number_sequence
set current_value = 100000, updated_at = now()
where key in ('customer_number', 'supplier_number')
  and current_value > 100000;
