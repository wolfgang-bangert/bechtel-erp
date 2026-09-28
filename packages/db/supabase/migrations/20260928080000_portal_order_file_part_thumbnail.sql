-- Neuer Dateityp "partThumbnail": eigene Vorschau je Druckdaten-Teil
-- (printDataPart). Das Portal liefert nur eine Vorschau (von der Titelseite
-- des Gesamtauftrags) - bei Aufträgen mit mehreren getrennten PDFs (ZIP mit
-- mehreren Druckdaten) fehlt damit die Vorschau für die weiteren Teile.
-- partThumbnail wird selbst aus der ersten Seite des jeweiligen
-- printDataPart-PDFs gerendert (services/sync, poppler/pdftoppm) und teilt
-- sich den filename mit seinem printDataPart, um die Zuordnung ohne eigene
-- Spalte zu ermöglichen.
alter table public.portal_order_file drop constraint if exists portal_order_file_typ_check;
alter table public.portal_order_file add constraint portal_order_file_typ_check
  check (typ in ('printData', 'printDataPart', 'jobSheet', 'thumbnail',
                 'deliveryNoteLabel', 'shippingLabel', 'laufzettel', 'partThumbnail'));
