-- ============================================================================
-- flux createOrder-Basiskonfig an das (funktionierende) Ninox-Payload angleichen:
-- vollständige Bechtel-submitterAddress, Preis-Block. Kein bestnummer-Feld –
-- die Auftragsnummer läuft über prefix (≤5) + projectName; sendeAuftragAnFlux
-- setzt projectName/prefix/deliveryDate je Auftrag.
-- ============================================================================

update public.setting
set value = jsonb_build_object(
  'projectName', 'onlineprinters',
  'orderNote', 'online Auftrag',
  'prefix', 'opri',
  'deliveryType', 'Bechtel Lieferservice',
  'submitterAddress', jsonb_build_object(
    'name', 'Bechtel Druck GmbH & Co. KG',
    'shortName', 'Bechtel Druck',
    'organisation', 'Bechtel Druck GmbH & Co. KG',
    'street', 'Hans-Zinser-Straße 6',
    'postalCode', '73061',
    'city', 'Ebersbach/Fils',
    'region', 'Baden-Württemberg',
    'state', 'Deutschland',
    'tel1', '+49 7163/53666-24',
    'tel2', '+49 7163/53666-0',
    'telfax', '+49 7163/53666-19',
    'email', 'info@bechtel-druck.de',
    'project', '',
    'projectNumber', '',
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
