-- ============================================================================
-- incoming_document: paid_total/open_amount persistieren + payment_status auf
-- 4 Zustände erweitern (wie sales_invoice: open/partly_paid/paid/overpaid).
-- Grund: der Kreditoren-Matcher (syncBankMatchKreditor) verglich einen neuen
-- Zahlungsbetrag bisher gegen gross_amount statt gegen den noch offenen Rest -
-- bei einer bereits teilweise (falsch) zugeordneten Rechnung konnte dadurch
-- eine zweite, unverwandte Bankzeile auf dieselbe Rechnung gematcht werden
-- (beobachtet bei ROTH Offset Owen OHG, Rechnung 2609-2502).
-- ============================================================================

alter table public.incoming_document
  drop constraint if exists incoming_document_payment_status_check;
alter table public.incoming_document
  add constraint incoming_document_payment_status_check
  check (payment_status in ('open', 'partly_paid', 'paid', 'overpaid'));

alter table public.incoming_document
  add column if not exists paid_total numeric(14,2) not null default 0;
alter table public.incoming_document
  drop column if exists open_amount;
alter table public.incoming_document
  add column open_amount numeric(14,2)
  generated always as (
    coalesce(gross_amount, 0) - coalesce(paid_total, 0) - coalesce(skonto_amount, 0)
  ) stored;

create or replace function public.recalc_incoming_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric(14,2); v_gross numeric(14,2); v_skonto numeric(14,2);
begin
  if p_id is null then return; end if;
  select coalesce(sum(abs(amount)), 0) into v_paid
    from public.bank_transaction_match where incoming_document_id = p_id;
  select coalesce(gross_amount, 0), coalesce(skonto_amount, 0) into v_gross, v_skonto
    from public.incoming_document where id = p_id;
  update public.incoming_document set
    paid_total = v_paid,
    payment_status = case
      when v_paid + v_skonto <= 0 then 'open'
      when v_paid + v_skonto + 0.005 < v_gross then 'partly_paid'
      when v_paid + v_skonto <= v_gross + 0.005 then 'paid'
      else 'overpaid'
    end,
    paid_at = case when v_paid + v_skonto + 0.005 >= v_gross and v_gross > 0
                   then coalesce(paid_at, current_date) else paid_at end
  where id = p_id;
end $$;
