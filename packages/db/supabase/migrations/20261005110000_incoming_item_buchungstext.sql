-- Buchungstext je Belegposition (DATEV-Buchungstext, max. 60 Zeichen im Export). Leer = Standardtext "ER <Belegnr> <Lieferant>".
alter table public.incoming_document_item
  add column if not exists booking_text text;
