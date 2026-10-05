-- Gutschriftverfahren: Der Kunde stellt die Abrechnung aus und überweist (z.B. Festool-Konsignationsabrechnung).
-- Solche Belege sind unser Umsatz (Ausgangsrechnung), kein Eingangsbeleg.
alter table public.organization
  add column if not exists gutschriftverfahren boolean not null default false;
