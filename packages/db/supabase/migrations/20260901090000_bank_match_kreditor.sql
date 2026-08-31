-- ============================================================================
-- Bank-Abgleich Soll-Seite: bank_transaction_match kann jetzt auch auf eine
-- Eingangsrechnung zeigen (statt nur auf sales_invoice). Genau ein Ziel.
-- ============================================================================

alter table public.bank_transaction_match
  alter column sales_invoice_id drop not null,
  add column if not exists incoming_document_id uuid
    references public.incoming_document (id) on delete cascade;

alter table public.bank_transaction_match
  drop constraint if exists btm_one_target;
alter table public.bank_transaction_match
  add constraint btm_one_target check (
    (sales_invoice_id is not null)::int + (incoming_document_id is not null)::int = 1
  );

create unique index if not exists btm_txn_incdoc_uidx
  on public.bank_transaction_match (bank_transaction_id, incoming_document_id)
  where incoming_document_id is not null;
create index if not exists btm_incdoc_idx
  on public.bank_transaction_match (incoming_document_id);

-- Zahlstatus der Eingangsrechnung aus den zugeordneten Bankbeträgen ableiten.
create or replace function public.tg_recalc_incoming_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid := coalesce(new.incoming_document_id, old.incoming_document_id);
  v_paid numeric(14,2);
  v_gross numeric(14,2);
begin
  if v_doc is null then
    return null;
  end if;
  select coalesce(sum(abs(amount)), 0) into v_paid
    from public.bank_transaction_match where incoming_document_id = v_doc;
  select coalesce(gross_amount, 0) into v_gross
    from public.incoming_document where id = v_doc;

  update public.incoming_document set
    payment_status = case when v_paid + 0.005 >= v_gross and v_gross > 0 then 'paid' else 'open' end,
    paid_at = case
      when v_paid + 0.005 >= v_gross and v_gross > 0 then coalesce(paid_at, current_date)
      else null
    end
  where id = v_doc;

  return null;
end;
$$;

create trigger recalc_incoming_payment
  after insert or update or delete on public.bank_transaction_match
  for each row execute function public.tg_recalc_incoming_payment();
