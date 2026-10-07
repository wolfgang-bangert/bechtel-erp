-- Ausgangsrechnungen, die nicht in die Buchhaltung (UStVA, DATEV-Export, Erlösbuchung) gehören - z. B. der Verkauf
-- einer Druckmaschine, der über den Steuerberater gebucht wird. Die Rechnung bleibt am Kunden auffindbar und kann
-- einer Zahlung zugeordnet werden.
alter table public.sales_invoice
  add column if not exists ohne_buchhaltung boolean not null default false,
  add column if not exists ohne_buchhaltung_grund text;
