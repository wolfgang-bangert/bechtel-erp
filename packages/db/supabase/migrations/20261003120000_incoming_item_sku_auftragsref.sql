-- Eingangsbeleg-Positionen: Artikelnummer/SKU des Lieferanten, Referenztext
-- laut Beleg; Auftragszuordnung merkt sich die gelesene Referenz auch dann,
-- wenn (noch) kein sales_order dazu existiert.
alter table public.incoming_document_item
  add column if not exists supplier_sku     text,
  add column if not exists order_reference  text;

alter table public.incoming_document_allocation
  add column if not exists order_ref text;
