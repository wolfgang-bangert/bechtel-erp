-- ============================================================================
-- Akonto-Zahlungen: Bankzeile an einen Debitor/Kreditor OHNE Rechnungsbezug
-- (z. B. Ratenzahlungen eines Kunden auf bereits gestellte Rechnungen). Später
-- wird das Akonto mit den ältesten offenen Rechnungen verrechnet (die
-- Akonto-Zeile wird dabei in Rechnungs-Zuordnungen derselben Bankzeile
-- umgewandelt). DATEV-Export: Geldkonto an Debitor/Kreditor, Belegfeld "AKONTO".
-- ============================================================================

alter table public.bank_transaction_match
  add column if not exists organization_id uuid references public.organization (id) on delete set null;
create index if not exists btm_organization_idx on public.bank_transaction_match (organization_id)
  where organization_id is not null;

alter table public.bank_transaction_match drop constraint if exists bank_transaction_match_kind_check;
alter table public.bank_transaction_match add constraint bank_transaction_match_kind_check
  check (kind in ('skonto', 'doppelzahlung', 'sonstige', 'umbuchung', 'akonto'));
