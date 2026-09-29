-- posting_rule dient jetzt auch reinen Debitoren-Regeln (nur revenue_account,
-- kein expense_account) - Kreditoren-Feld muss dafür nullable sein.
alter table public.posting_rule
  alter column expense_account drop not null;
