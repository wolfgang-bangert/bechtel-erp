-- ============================================================================
-- flux createOrder-Basiskonfig an das erprobte Payload angleichen:
-- vollständige submitterAddress, deliveryAddress-Skelett, deliveryDate/orderDate.
-- Werte bewusst leer (wie im erprobten Payload) – nur Name/ShortName gesetzt.
-- Die Lieferadresse je Auftrag füllt sendeAuftragAnFlux() aus portal_order.ship_to.
-- ============================================================================

update public.setting
set value = jsonb_build_object(
  'projectName', 'onlineprinters',
  'orderNote', 'online Auftrag',
  'deliveryType', 'Bechtel Lieferservice',
  'deliveryDate', '',
  'orderDate', '',
  'submitterAddress', jsonb_build_object(
    'name', 'Bechtel Druck GmbH & Co. KG',
    'shortName', 'opri',
    'organisation', '', 'street', '', 'postalCode', '', 'city', '',
    'region', '', 'state', '', 'tel1', '', 'tel2', '', 'telfax', '',
    'email', null, 'project', '', 'projectNumber', '',
    'custom1', '', 'custom2', '', 'custom3', ''
  ),
  'deliveryAddress', jsonb_build_object(
    'id', '', 'name', '', 'shortName', '', 'organisation', '',
    'street', '', 'postalCode', '', 'city', '', 'region', '', 'state', '',
    'tel1', '', 'tel2', '', 'telfax', '', 'email', null,
    'project', '', 'projectNumber', '', 'custom3', ''
  ),
  'price', jsonb_build_object(
    'currency', 'EUR', 'subTotal', 0, 'delivery', 0,
    'deliveryVat', 0, 'totalNet', 0, 'total', 0
  )
)
where key = 'flux_createorder_base';
