-- Neuer Dateityp "laufzettel": werk-generierter Produktions-Begleitzettel je
-- Auftrag (Materialliste, Arbeitsvorgänge, Wire-O-Angaben) - ergänzt die vom
-- Portal gelieferte, unveränderte "jobSheet" (Auftragslauftasche).
alter table public.portal_order_file drop constraint if exists portal_order_file_typ_check;
alter table public.portal_order_file add constraint portal_order_file_typ_check
  check (typ in ('printData', 'printDataPart', 'jobSheet', 'thumbnail',
                 'deliveryNoteLabel', 'shippingLabel', 'laufzettel'));
