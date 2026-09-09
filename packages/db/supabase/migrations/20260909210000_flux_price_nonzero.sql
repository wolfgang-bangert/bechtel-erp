-- flux-Preisblock auf die (funktionierenden) n8n-Werte setzen; 0/0 könnte
-- flux ablehnen.
update public.setting
set value = jsonb_set(
  value, '{price}',
  jsonb_build_object(
    'currency', 'EUR', 'subTotal', 20, 'delivery', 5,
    'deliveryVat', 19, 'totalNet', 25, 'total', 30
  )
)
where key = 'flux_createorder_base';
