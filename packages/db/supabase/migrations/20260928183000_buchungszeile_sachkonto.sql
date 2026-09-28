-- ============================================================================
-- bank_transaction_match wird zur echten "Buchungszeile": statt eines festen
-- kind-Labels (skonto/doppelzahlung/sonstige) kann sie jetzt ein reales
-- Sachkonto referenzieren (Kontonummer als text, wie überall sonst im
-- Projekt - siehe incoming_document(_item).ledger_account - DATEV braucht
-- die Nummer direkt, kein FK-Umweg nötig). kind/note bleiben als weicher
-- Freitext-Fall erhalten (z.B. wenn (noch) kein passendes Sachkonto existiert).
-- ============================================================================

alter table public.bank_transaction_match
  add column if not exists ledger_account text,
  add column if not exists net_amount numeric(14,2),
  add column if not exists tax_rate numeric(6,3),
  add column if not exists tax_amount numeric(14,2),
  add column if not exists attachment_storage_key text,
  add column if not exists attachment_file_name text;

-- Neue Sachkonten: Durchlaufende Posten + Skonto (bisher nur lose im Setting
-- "datev.skonto_accounts" hinterlegt, jetzt echte Sachkonten wie alle anderen).
insert into public.ledger_account (number, name, kind, is_system) values
  ('1590', 'Durchlaufende Posten',            'liability', true),
  ('3736', 'Erhaltene Skonti 19 % Vorsteuer', 'expense',   true),
  ('3731', 'Erhaltene Skonti 7 % Vorsteuer',  'expense',   true),
  ('8736', 'Gewährte Skonti 19 % USt',        'revenue',   true),
  ('8731', 'Gewährte Skonti 7 % USt',         'revenue',   true)
on conflict (number) do nothing;

-- Bestehende kind-basierte Zeilen auf die neuen Sachkonten ummappen:
-- Betrag < 0 (eigene Zahlung/Soll) -> Kreditoren-Skonto (3736), Betrag >= 0
-- (Kundenzahlung/Haben) -> Debitoren-Skonto (8736). Ohne genaue
-- Steuersatz-Info pauschal 19 %-Konto (siehe Ninox-Import-Begründung).
update public.bank_transaction_match m
set ledger_account = case
  when m.kind = 'skonto' and t.amount < 0 then '3736'
  when m.kind = 'skonto' and t.amount >= 0 then '8736'
  when m.kind = 'doppelzahlung' then '1590'
  else m.ledger_account
end
from public.bank_transaction t
where t.id = m.bank_transaction_id
  and m.kind in ('skonto', 'doppelzahlung')
  and m.ledger_account is null;

-- btm_one_target lockern: jetzt zusätzlich "ledger_account" als gültiges
-- Ziel. "sonstige" (kind gesetzt, kein Ziel) bleibt als reiner
-- Freitext-Fall weiterhin erlaubt.
alter table public.bank_transaction_match
  drop constraint if exists btm_one_target;
alter table public.bank_transaction_match
  add constraint btm_one_target check (
    (sales_invoice_id is not null)::int
    + (incoming_document_id is not null)::int
    + (ledger_account is not null)::int
    + (
        sales_invoice_id is null and incoming_document_id is null
        and ledger_account is null and kind is not null
      )::int
    = 1
  );
