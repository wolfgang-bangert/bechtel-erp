-- Zahlart-Kennzeichnung (Kreditkarte/PayPal) für Eingangsrechnungen: solche
-- Belege landen auf dem Bankauszug nicht als Einzelzahlung, sondern gebündelt
-- in einer Kreditkarten-/PayPal-Sammelabrechnung - hilft beim Filtern und
-- beim gruppierten Zuordnen zu genau dieser einen Bankzeile.
alter table public.incoming_document
  add column if not exists payment_method text
  check (payment_method in ('card', 'paypal'));
