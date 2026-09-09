-- flux-Basiskonfig an den erprobten n8n-onlineprinters-Payload angleichen:
-- Absenderadresse = Onlineprinters GmbH; Auftragsnummer zusätzlich als
-- submitterAddress.projectNumber. prefix-Tag bleibt "opri_".
update public.setting
set value = jsonb_build_object(
  'projectName', 'onlineprinters',
  'orderNote', 'online Auftrag',
  'prefix', 'opri_',
  'deliveryType', 'Bechtel Lieferservice',
  'submitterAddress', jsonb_build_object(
    'name', 'Bechtel Druck GmbH & Co. KG',
    'shortName', 'opri',
    'organisation', 'Onlineprinters GmbH',
    'street', 'Rudolf-Diesel-Str. 10',
    'postalCode', '91413',
    'city', 'Neustadt a. d. Aisch',
    'region', '',
    'state', 'DEU',
    'tel1', '', 'tel2', '', 'telfax', '', 'email', '',
    'project', '', 'projectNumber', '',
    'custom1', '', 'custom2', '', 'custom3', ''
  ),
  'deliveryAddress', jsonb_build_object(
    'id', '', 'name', '', 'shortName', '', 'organisation', '',
    'street', '', 'postalCode', '', 'city', '', 'region', '', 'state', '',
    'tel1', '', 'tel2', '', 'telfax', '', 'email', null,
    'project', '', 'projectNumber', '', 'custom1', '', 'custom2', '', 'custom3', ''
  ),
  'price', jsonb_build_object(
    'currency', 'EUR', 'subTotal', 0, 'delivery', 0,
    'deliveryVat', 0, 'totalNet', 0, 'total', 0
  )
)
where key = 'flux_createorder_base';
