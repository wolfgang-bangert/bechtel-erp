-- Belegzeile mit einem bereits separat erfassten Eingangsrechnungen-Beleg
-- verknüpfen (z.B. SaaS-Anbieter schickt eigene Rechnung an
-- rechnungen@bechtel-druck.de UND die Position taucht zusätzlich auf der
-- Kreditkartenabrechnung auf - Brücke statt Doppelerfassung).
alter table public.incoming_document_item
  add column if not exists linked_document_id uuid references public.incoming_document (id) on delete set null;
create index if not exists incoming_document_item_linked_idx
  on public.incoming_document_item (linked_document_id);
