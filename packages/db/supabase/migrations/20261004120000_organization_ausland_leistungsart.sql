-- Auslandslieferant: liefert er Dienstleistungen (-> Reverse Charge §13b, automatisch) oder Ware
-- (-> kein §13b, z.B. Einfuhr; USt-Prüfung bleibt Vorschlag)? Leer = Standard: USD-Rechnung ohne USt gilt
-- als Dienstleistung. Dient als Ausnahme von dieser Standardregel und zur Automatik für
-- EU-Dienstleister ohne USD.
alter table public.organization
  add column if not exists foreign_supply_kind text
    check (foreign_supply_kind in ('service', 'goods'));

-- ---- merge_organization(): auch die Auslandslieferant-Einstellung übernehmen ----
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
  update public.incoming_document set supplier_organization_id = p_survivor where supplier_organization_id = p_loser;

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
    -- Vorkontierung: Gewinner behält seine, sonst die des Verlierers (inkl. Herkunft/Konfidenz)
    vorkontierung_source = case when s.default_expense_account is null and s.default_revenue_account is null
                                then v_l.vorkontierung_source else s.vorkontierung_source end,
    vorkontierung_confidence = case when s.default_expense_account is null and s.default_revenue_account is null
                                    then v_l.vorkontierung_confidence else s.vorkontierung_confidence end,
    default_expense_account = coalesce(s.default_expense_account, v_l.default_expense_account),
    default_revenue_account = coalesce(s.default_revenue_account, v_l.default_revenue_account),
    default_payment_method  = coalesce(s.default_payment_method, v_l.default_payment_method),
    foreign_supply_kind     = coalesce(s.foreign_supply_kind, v_l.foreign_supply_kind),
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
