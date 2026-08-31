-- ============================================================================
-- Skonto-Ausbuchung: der beim Zahlen einbehaltene bzw. gewährte Skontobetrag
-- schließt den offenen Posten. skonto_amount zählt wie eine Zahlung.
-- ============================================================================

alter table public.sales_invoice
  add column if not exists skonto_amount numeric(14,2) not null default 0;
alter table public.incoming_document
  add column if not exists skonto_amount numeric(14,2) not null default 0;

-- open_amount berücksichtigt jetzt auch das ausgebuchte Skonto
alter table public.sales_invoice drop column if exists open_amount;
alter table public.sales_invoice
  add column open_amount numeric(14,2)
  generated always as (
    coalesce(gross_total, 0) - coalesce(paid_total, 0) - coalesce(skonto_amount, 0)
  ) stored;

-- --- Ausgangsrechnungen: Zahlbetrag + Skonto -> Status --------------------------
create or replace function public.recalc_sales_invoice_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric(14,2); v_gross numeric(14,2); v_skonto numeric(14,2);
begin
  if p_id is null then return; end if;
  select coalesce(sum(amount), 0) into v_paid
    from public.bank_transaction_match where sales_invoice_id = p_id;
  select coalesce(gross_total, 0), coalesce(skonto_amount, 0) into v_gross, v_skonto
    from public.sales_invoice where id = p_id;
  update public.sales_invoice set
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

create or replace function public.tg_recalc_invoice_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_sales_invoice_payment(coalesce(new.sales_invoice_id, old.sales_invoice_id));
  return null;
end $$;

create or replace function public.tg_sales_invoice_skonto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_sales_invoice_payment(new.id);
  return null;
end $$;
drop trigger if exists sales_invoice_skonto on public.sales_invoice;
create trigger sales_invoice_skonto
  after update of skonto_amount on public.sales_invoice
  for each row when (new.skonto_amount is distinct from old.skonto_amount)
  execute function public.tg_sales_invoice_skonto();

-- --- Eingangsrechnungen: Zahlbetrag + Skonto -> Status ------------------------
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
    payment_status = case when v_paid + v_skonto + 0.005 >= v_gross and v_gross > 0
                          then 'paid' else 'open' end,
    paid_at = case when v_paid + v_skonto + 0.005 >= v_gross and v_gross > 0
                   then coalesce(paid_at, current_date) else null end
  where id = p_id;
end $$;

create or replace function public.tg_recalc_incoming_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_incoming_payment(coalesce(new.incoming_document_id, old.incoming_document_id));
  return null;
end $$;

create or replace function public.tg_incoming_skonto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_incoming_payment(new.id);
  return null;
end $$;
drop trigger if exists incoming_skonto on public.incoming_document;
create trigger incoming_skonto
  after update of skonto_amount on public.incoming_document
  for each row when (new.skonto_amount is distinct from old.skonto_amount)
  execute function public.tg_incoming_skonto();

-- --- DATEV-Skontokonten (SKR03) --------------------------------------------
insert into public.setting (key, value)
values (
  'datev.skonto_accounts',
  '{"received_19":"3736","received_7":"3731","granted_19":"8736","granted_7":"8731"}'::jsonb
)
on conflict (key) do nothing;
