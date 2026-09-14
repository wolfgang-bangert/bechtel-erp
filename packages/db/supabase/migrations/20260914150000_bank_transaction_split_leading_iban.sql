-- Manche Banken (beobachtet u.a. bei KSK/BW-Bank) liefern per FinTS die IBAN
-- des Gegenkontos ohne Trennzeichen direkt vor dem Namen im applicant_name-
-- Feld ("DE10600501010004202983Geiger GmbH + Co. KG"), applicant_iban blieb
-- dabei leer -> counterparty_iban ist null, counterparty_name trägt die IBAN
-- mit. services/sync/src/fints.ts trennt das ab jetzt beim Import; hier
-- einmalig die bereits importierten Buchungen bereinigen.
update public.bank_transaction
set
  counterparty_iban = substring(counterparty_name from '^([A-Z]{2}[0-9]{2}[A-Z0-9]{11,30})(?=[A-ZÄÖÜ])'),
  counterparty_name = trim(
    regexp_replace(counterparty_name, '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}(?=[A-ZÄÖÜ])', '')
  )
where counterparty_iban is null
  and counterparty_name ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}(?=[A-ZÄÖÜ])';
