-- bank_transaction_match.kind-Whitelist um 'umbuchung' erweitern - für
-- automatisch erkannte Eigenkonten-Umbuchungen (Überträge zwischen eigenen
-- Bankkonten, siehe syncEigenkontenUmbuchung.ts).
alter table public.bank_transaction_match drop constraint if exists bank_transaction_match_kind_check;
alter table public.bank_transaction_match add constraint bank_transaction_match_kind_check
  check (kind in ('skonto', 'doppelzahlung', 'sonstige', 'umbuchung'));
