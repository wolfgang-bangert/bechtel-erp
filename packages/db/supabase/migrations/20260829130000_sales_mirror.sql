-- ============================================================================
-- Spiegel-Tabellen für Aufträge und Rechnungen aus Keyline und Ninox.
-- Read-mostly: Historie + Grundlage für spätere native Fakturierung (Slice 3).
-- Geld in EUR (numeric), Keyline-Cent-Werte werden beim Sync /100 gerechnet.
-- Volle Quell-Payload steht in `raw` (jsonb), damit Mapping später erweiterbar ist.
-- ============================================================================

create table public.sales_order (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('keyline', 'ninox', 'werk')),
  external_id       text unique,
  organization_id   uuid references public.organization (id) on delete set null,
  contact_id        uuid references public.contact (id) on delete set null,
  order_number      text,
  state             text,
  order_date        date,
  delivery_date     date,
  due_date          date,
  net_total         numeric(14,2),
  currency          char(3) not null default 'EUR',
  business_unit_id  integer,
  raw               jsonb,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index sales_order_org_idx on public.sales_order (organization_id);
create index sales_order_source_idx on public.sales_order (source);

create table public.sales_order_item (
  id             uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_order (id) on delete cascade,
  source         text not null check (source in ('keyline', 'ninox', 'werk')),
  external_id    text unique,
  position       integer,
  description    text,
  kind           text,
  quantity       numeric(14,3),
  unit_price     numeric(14,4),
  net_amount     numeric(14,2),
  raw            jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index sales_order_item_order_idx on public.sales_order_item (sales_order_id);

create table public.sales_invoice (
  id                          uuid primary key default gen_random_uuid(),
  source                      text not null check (source in ('keyline', 'ninox', 'werk')),
  external_id                 text unique,
  organization_id             uuid references public.organization (id) on delete set null,
  contact_id                  uuid references public.contact (id) on delete set null,
  sales_order_id              uuid references public.sales_order (id) on delete set null,
  invoice_number              text,
  kind                        text not null default 'invoice'
                                check (kind in ('invoice', 'credit_note')),
  reversed_invoice_external_id text,
  invoice_date                date,
  service_date                date,
  due_date                    date,
  paid_at                     date,
  net_total                   numeric(14,2),
  tax_total                   numeric(14,2),
  gross_total                 numeric(14,2),
  paid_total                  numeric(14,2),
  tax_breakdown               jsonb,
  currency                    char(3) not null default 'EUR',
  billing_address_snapshot    jsonb,
  business_unit_id            integer,
  raw                         jsonb,
  synced_at                   timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index sales_invoice_org_idx on public.sales_invoice (organization_id);
create index sales_invoice_order_idx on public.sales_invoice (sales_order_id);
create index sales_invoice_source_idx on public.sales_invoice (source);
create index sales_invoice_date_idx on public.sales_invoice (invoice_date);

create table public.sales_invoice_item (
  id               uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.sales_invoice (id) on delete cascade,
  source           text not null check (source in ('keyline', 'ninox', 'werk')),
  external_id      text unique,
  position         integer,
  description      text,
  quantity         numeric(14,3),
  unit_price       numeric(14,4),
  tax_rate         numeric(6,3),
  net_amount       numeric(14,2),
  raw              jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index sales_invoice_item_invoice_idx on public.sales_invoice_item (sales_invoice_id);

-- ---- Trigger (updated_at + Audit) ----
do $$
declare t text;
begin
  foreach t in array array[
    'sales_order', 'sales_order_item', 'sales_invoice', 'sales_invoice_item'
  ] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- RLS ----
create policy so_staff_read on public.sales_order for select using (public.is_staff());
create policy so_staff_write on public.sales_order for all
  using (public.has_any_role(array['admin','office','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','office','accounting']::app_role[]));
create policy so_customer_read on public.sales_order for select
  using (organization_id in (select public.customer_org_ids()));

create policy soi_staff_read on public.sales_order_item for select using (public.is_staff());
create policy soi_staff_write on public.sales_order_item for all
  using (public.has_any_role(array['admin','office','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','office','accounting']::app_role[]));
create policy soi_customer_read on public.sales_order_item for select
  using (sales_order_id in (
    select id from public.sales_order where organization_id in (select public.customer_org_ids())
  ));

create policy si_staff_read on public.sales_invoice for select using (public.is_staff());
create policy si_staff_write on public.sales_invoice for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
create policy si_customer_read on public.sales_invoice for select
  using (organization_id in (select public.customer_org_ids()));

create policy sii_staff_read on public.sales_invoice_item for select using (public.is_staff());
create policy sii_staff_write on public.sales_invoice_item for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
create policy sii_customer_read on public.sales_invoice_item for select
  using (sales_invoice_id in (
    select id from public.sales_invoice where organization_id in (select public.customer_org_ids())
  ));

-- ---- merge_organization() um die neuen Kindtabellen erweitern ----
create or replace function public.merge_organization(p_survivor uuid, p_loser uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.organization;
  v_l public.organization;
  v_auth_system text;
begin
  if p_survivor is null or p_loser is null or p_survivor = p_loser then
    raise exception 'ungueltige Merge-Parameter';
  end if;

  select * into v_s from public.organization where id = p_survivor for update;
  select * into v_l from public.organization where id = p_loser for update;
  if v_s.id is null then raise exception 'Gewinner % nicht gefunden', p_survivor; end if;
  if v_l.id is null then raise exception 'Verlierer % nicht gefunden', p_loser; end if;

  update public.organization_external_ref set is_authoritative = false where organization_id = p_loser;
  update public.organization_external_ref set organization_id = p_survivor where organization_id = p_loser;

  select case
    when exists (select 1 from public.organization_external_ref
                  where organization_id = p_survivor and system = 'keyline') then 'keyline'
    when exists (select 1 from public.organization_external_ref
                  where organization_id = p_survivor and system = 'ninox') then 'ninox'
    else (select system from public.organization_external_ref
           where organization_id = p_survivor order by created_at limit 1)
  end into v_auth_system;

  update public.organization_external_ref set is_authoritative = false where organization_id = p_survivor;
  update public.organization_external_ref set is_authoritative = true
   where id = (select id from public.organization_external_ref
                where organization_id = p_survivor and system = v_auth_system
                order by created_at limit 1);

  update public.address set is_default = false where organization_id = p_loser;
  update public.address set organization_id = p_survivor where organization_id = p_loser;
  if not exists (select 1 from public.address where organization_id = p_survivor and is_default) then
    update public.address set is_default = true
     where id = (select id from public.address where organization_id = p_survivor order by created_at limit 1);
  end if;

  update public.contact set is_primary = false where organization_id = p_loser;
  update public.contact set organization_id = p_survivor where organization_id = p_loser;
  if not exists (select 1 from public.contact where organization_id = p_survivor and is_primary) then
    update public.contact set is_primary = true
     where id = (select id from public.contact where organization_id = p_survivor order by created_at limit 1);
  end if;

  delete from public.user_role ul using public.user_role us
   where ul.organization_id = p_loser and us.organization_id = p_survivor
     and ul.user_id = us.user_id and ul.role = us.role;
  update public.user_role set organization_id = p_survivor where organization_id = p_loser;

  update public.file          set organization_id = p_survivor where organization_id = p_loser;
  update public.sales_order    set organization_id = p_survivor where organization_id = p_loser;
  update public.sales_invoice  set organization_id = p_survivor where organization_id = p_loser;

  update public.organization set customer_number = null, supplier_number = null where id = p_loser;

  update public.organization s set
    legal_name       = coalesce(s.legal_name, v_l.legal_name),
    customer_number  = coalesce(s.customer_number, v_l.customer_number),
    supplier_number  = coalesce(s.supplier_number, v_l.supplier_number),
    vat_id           = coalesce(s.vat_id, v_l.vat_id),
    vat_id_valid     = coalesce(s.vat_id_valid, v_l.vat_id_valid),
    email            = coalesce(s.email, v_l.email),
    phone            = coalesce(s.phone, v_l.phone),
    website          = coalesce(s.website, v_l.website),
    payment_terms_id = coalesce(s.payment_terms_id, v_l.payment_terms_id),
    price_group_id   = coalesce(s.price_group_id, v_l.price_group_id),
    notes            = coalesce(s.notes, v_l.notes),
    relation         = case when s.relation = v_l.relation then s.relation else 'both'::org_relation end,
    customer_segment = case
                         when s.customer_segment is null then v_l.customer_segment
                         when v_l.customer_segment is null then s.customer_segment
                         when s.customer_segment = v_l.customer_segment then s.customer_segment
                         else 'mixed'
                       end,
    updated_at = now()
  where s.id = p_survivor;

  insert into public.organization_merge (survivor_id, loser_id, loser_snapshot, merged_by)
  values (p_survivor, p_loser, to_jsonb(v_l), auth.uid());

  delete from public.organization where id = p_loser;

  return jsonb_build_object('survivor', p_survivor, 'loser', p_loser, 'auth_system', v_auth_system);
end;
$$;

revoke all on function public.merge_organization(uuid, uuid) from public;
