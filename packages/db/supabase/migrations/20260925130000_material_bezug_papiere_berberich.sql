-- ============================================================================
-- Materialbezüge für alle Papiere (außer Multiloft/Karton) anlegen: je Papier
-- Rohbogen+Druckbogen-Paar für SRA3eco (aus 63x88), SRA3 (aus 65x92) und
-- SRA3max (aus 70x100), jeweils 4 Nutzen. Lieferant: Carl Berberich GmbH
-- (bereits als organization vorhanden). Bezeichnung ist ein Platzhalter -
-- die echten Lieferanten-Produktnamen trägt der Nutzer selbst nach.
-- ============================================================================

do $$
declare
  v_lieferant_id uuid;
begin
  select id into v_lieferant_id from public.organization where name = 'Carl Berberich GmbH' limit 1;

  -- Schritt 1: Rohbogen-Zeilen (eine je Material × Rohbogen-Format)
  with formate(rohbogen_code) as (
    values ('63x88'), ('65x92'), ('70x100')
  ),
  papiere(material_name) as (
    values
      ('115g Bilderdruck glänzend'), ('115g Bilderdruck matt'),
      ('130g Bilderdruck glänzend'), ('130g Bilderdruck matt'),
      ('170g Bilderdruck glänzend'), ('170g Bilderdruck matt'),
      ('250g Bilderdruck glänzend'), ('250g Bilderdruck matt'), ('250g Offset'),
      ('300g Bilderdruck glänzend'), ('300g Bilderdruck matt'),
      ('80g Offset'), ('80g Recycling weiß')
  )
  insert into public.material_bezug (material_id, lieferant_org_id, bezeichnung, rohbogen_id, bestand, einheit)
  select m.id, v_lieferant_id, 'Papier von Berberich', r.id, 0, 'Bogen'
  from papiere p
  join public.material m on m.name = p.material_name
  cross join formate f
  join public.rohbogen r on r.code = f.rohbogen_code;

  -- Schritt 2: Druckbogen-Zeilen, quelle_bezug_id = die passende Rohbogen-Zeile aus Schritt 1
  with formate(druckbogen_code, rohbogen_code, nutzen) as (
    values ('SRA3eco', '63x88', 4), ('SRA3', '65x92', 4), ('SRA3max', '70x100', 4)
  ),
  papiere(material_name) as (
    values
      ('115g Bilderdruck glänzend'), ('115g Bilderdruck matt'),
      ('130g Bilderdruck glänzend'), ('130g Bilderdruck matt'),
      ('170g Bilderdruck glänzend'), ('170g Bilderdruck matt'),
      ('250g Bilderdruck glänzend'), ('250g Bilderdruck matt'), ('250g Offset'),
      ('300g Bilderdruck glänzend'), ('300g Bilderdruck matt'),
      ('80g Offset'), ('80g Recycling weiß')
  )
  insert into public.material_bezug
    (material_id, lieferant_org_id, bezeichnung, druckbogen_id, quelle_bezug_id, nutzen, bestand, einheit)
  select m.id, v_lieferant_id, 'Papier von Berberich', d.id, roh.id, f.nutzen, 0, 'Bogen'
  from papiere p
  join public.material m on m.name = p.material_name
  cross join formate f
  join public.druckbogen d on d.code = f.druckbogen_code
  join public.rohbogen r2 on r2.code = f.rohbogen_code
  join public.material_bezug roh on roh.material_id = m.id and roh.rohbogen_id = r2.id;
end $$;
