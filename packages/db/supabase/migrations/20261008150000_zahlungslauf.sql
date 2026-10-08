-- Zahlungsläufe: Auswahl offener Eingangsrechnungen -> SEPA-Sammeldatei (pain.001) für das Online-Banking.
create table public.payment_batch (
  id             uuid primary key default gen_random_uuid(),
  msg_id         text not null unique,
  debtor_name    text not null,
  debtor_iban    text not null,
  debtor_bic     text,
  execution_date date not null,
  format         text not null default 'pain.001.001.03' check (format in ('pain.001.001.03', 'pain.001.001.09')),
  item_count     integer not null,
  total          numeric(14,2) not null,
  status         text not null default 'erzeugt' check (status in ('erzeugt', 'eingereicht', 'verworfen')),
  xml            text not null,
  submitted_at   timestamptz,
  created_by     uuid references public.app_user (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.payment_batch_item (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references public.payment_batch (id) on delete cascade,
  incoming_document_id uuid references public.incoming_document (id) on delete set null,
  creditor_name        text not null,
  creditor_iban        text not null,
  amount               numeric(14,2) not null check (amount > 0),
  skonto_amount        numeric(14,2) not null default 0,
  remittance           text not null,
  end_to_end_id        text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index payment_batch_item_batch_idx on public.payment_batch_item (batch_id);
create index payment_batch_item_doc_idx on public.payment_batch_item (incoming_document_id);

do $$
declare t text;
begin
  foreach t in array array['payment_batch', 'payment_batch_item'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.has_any_role(array[''admin'',''accounting'']::app_role[]))', t || '_read', t);
    execute format('create policy %I on public.%I for all using (public.has_any_role(array[''admin'',''accounting'']::app_role[])) with check (public.has_any_role(array[''admin'',''accounting'']::app_role[]))', t || '_write', t);
  end loop;
end $$;
