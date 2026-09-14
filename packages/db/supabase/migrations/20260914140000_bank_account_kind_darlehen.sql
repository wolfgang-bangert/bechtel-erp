-- Unterscheidung Girokonto/Darlehenskonto: Darlehenskonten laufen zwar über
-- denselben FinTS-Abruf (weiterhin mit synchronisiert), sollen aber nicht in
-- der normalen /bank-Übersicht (Kontostände, Umsätze/Zuordnung) auftauchen -
-- dort gehört nur das laufende Zahlungsgeschäft hin.
alter table public.bank_account
  add column if not exists kind text not null default 'giro'
    check (kind in ('giro', 'darlehen'));

-- Oberbank-Konto ...111855 ist ein Darlehenskonto (Nutzer-Hinweis 14.9.2026).
update public.bank_account
set kind = 'darlehen'
where right(iban, 6) = '111855';
