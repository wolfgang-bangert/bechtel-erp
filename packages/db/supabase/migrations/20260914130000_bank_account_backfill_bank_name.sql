-- Bestehende bank_account-Zeilen wurden bisher ohne bank_name angelegt
-- (FinTS/CSV-Import setzten das Feld nicht) - der Avatar auf /bank zeigte
-- dadurch überall nur "KO" (aus dem generischen Label "Konto ..."). Ab jetzt
-- füllt der FinTS-Import bank_name aus dem Kürzel in imports/fints.txt
-- (siehe services/sync/src/fints.ts); hier nur die bereits vorhandenen
-- Konten einmalig nachziehen, ohne eine schon von Hand gepflegte
-- Bezeichnung zu überschreiben.
update public.bank_account
set bank_name = case right(iban, 4)
    when '1702' then 'KSK'
    when '8005' then 'VB'
    when '1799' then 'BWBANK'
    when '1855' then 'OBERBANK'
    when '0667' then 'OBERBANK2'
  end
where bank_name is null
  and right(iban, 4) in ('1702', '8005', '1799', '1855', '0667');
