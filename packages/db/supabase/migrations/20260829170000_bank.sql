-- ============================================================================
-- Bankkonten, importierte Umsätze (CAMT.053 / später GoCardless) und die
-- Zuordnung von Umsätzen zu Ausgangsrechnungen (offene Posten).
-- ============================================================================

create table public.bank_account (
  id                 uuid primary key default gen_random_uuid(),
  iban               text not null unique,
  label              text not null,
  bank_name          text,
  ledger_account     text,          -- SKR03-Sachkonto (z. B. 1200)
  gocardless_account_id text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.bank_transaction (
  id                 uuid primary key default gen_random_uuid(),
  bank_account_id    uuid not null references public.bank_account (id) on delete cascade,
  booking_date       date not null,
  value_date         date,
  amount             numeric(14,2) not null,   -- + Gutschrift, - Lastschrift
  currency           char(3) not null default 'EUR',
  counterparty_name  text,
  counterparty_iban  text,
  purpose            text,
  end_to_end_id      text,
  bank_ref           text,
  import_batch       text,
  raw                jsonb,
  dedup_key          text not null unique,
  match_status       text not null default 'unmatched'
                       check (match_status in ('unmatched', 'matched', 'partial', 'ignored')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index bank_transaction_acct_idx on public.bank_transaction (bank_account_id, booking_date);
create index bank_transaction_status_idx on public.bank_transaction (match_status);

create table public.bank_transaction_match (
  id                  uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references public.bank_transaction (id) on delete cascade,
  sales_invoice_id    uuid not null references public.sales_invoice (id) on delete cascade,
  amount              numeric(14,2) not null,
  auto                boolean not null default false,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  unique (bank_transaction_id, sales_invoice_id)
);
create index btm_invoice_idx on public.bank_transaction_match (sales_invoice_id);

-- offene Posten auf sales_invoice
alter table public.sales_invoice
  add column if not exists payment_status text not null default 'open'
    check (payment_status in ('open', 'partly_paid', 'paid', 'overpaid')),
  add column if not exists open_amount numeric(14,2)
    generated always as (coalesce(gross_total, 0) - coalesce(paid_total, 0)) stored;

-- paid_total + payment_status aus den Matches nachführen
create or replace function public.tg_recalc_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice uuid := coalesce(new.sales_invoice_id, old.sales_invoice_id);
  v_paid numeric(14,2);
  v_gross numeric(14,2);
begin
  select coalesce(sum(amount), 0) into v_paid
    from public.bank_transaction_match where sales_invoice_id = v_invoice;
  select coalesce(gross_total, 0) into v_gross
    from public.sales_invoice where id = v_invoice;

  update public.sales_invoice set
    paid_total = v_paid,
    payment_status = case
      when v_paid <= 0 then 'open'
      when v_paid + 0.005 < v_gross then 'partly_paid'
      when v_paid <= v_gross + 0.005 then 'paid'
      else 'overpaid'
    end,
    paid_at = case when v_paid + 0.005 >= v_gross and v_gross > 0
                   then coalesce(paid_at, current_date) else paid_at end
  where id = v_invoice;

  return null;
end;
$$;

create trigger recalc_invoice_payment
  after insert or update or delete on public.bank_transaction_match
  for each row execute function public.tg_recalc_invoice_payment();

-- Trigger + RLS
do $$
declare t text;
begin
  foreach t in array array['bank_account', 'bank_transaction', 'bank_transaction_match'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy ba_read  on public.bank_account for select using (public.is_staff());
create policy ba_write on public.bank_account for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy bt_read  on public.bank_transaction for select
  using (public.has_any_role(array['admin','accounting']::app_role[]));
create policy bt_write on public.bank_transaction for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy btm_read  on public.bank_transaction_match for select
  using (public.has_any_role(array['admin','accounting']::app_role[]));
create policy btm_write on public.bank_transaction_match for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
