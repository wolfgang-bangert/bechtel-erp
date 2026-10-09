-- ============================================================================
-- Organisationen verschmelzen (Warenkorb unter /organisationen).
--
-- merge_organization() kannte nur die Kindtabellen, die beim Schreiben
-- existierten - neuere (material, material_bezug, shipment, invoice, portal,
-- dokument ...) wären beim Löschen des Verlierers geleert,
-- mitgelöscht oder hätten den Merge blockiert. Jetzt:
--   * Tabellen mit Sonderregeln (Fremdsystem-Refs, Adressen, Kontakte,
--     Benutzerrollen) werden wie bisher einzeln behandelt,
--   * ALLE übrigen Fremdschlüssel auf organization(id) werden über den
--     Katalog gefunden und umgehängt - auch Tabellen, die später dazukommen.
-- Dazu organization_verweise(): Anzahl verknüpfter Datensätze je Tabelle
-- (Anzeige im Warenkorb vor dem Verschmelzen).
-- ============================================================================

create or replace function public.merge_organization(p_survivor uuid, p_loser uuid, p_merged_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.organization;
  v_l public.organization;
  v_auth_system text;
  v_fk record;
  v_n integer;
  v_umgehaengt jsonb := '{}'::jsonb;
begin
  if p_survivor is null or p_loser is null or p_survivor = p_loser then
    raise exception 'ungueltige Merge-Parameter';
  end if;

  select * into v_s from public.organization where id = p_survivor for update;
  select * into v_l from public.organization where id = p_loser for update;
  if v_s.id is null then raise exception 'Gewinner % nicht gefunden', p_survivor; end if;
  if v_l.id is null then raise exception 'Verlierer % nicht gefunden', p_loser; end if;

  -- 1) Fremdsystem-Refs (höchstens eine führende Quelle: Keyline vor Ninox vor ältester)
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

  -- 2) Adressen / Kontakte (Standard bleibt beim Gewinner)
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

  -- 3) Benutzerrollen (Dubletten weg, Rest umhängen)
  delete from public.user_role ul using public.user_role us
   where ul.organization_id = p_loser and us.organization_id = p_survivor
     and ul.user_id = us.user_id and ul.role = us.role;
  update public.user_role set organization_id = p_survivor where organization_id = p_loser;

  -- 4) Alle übrigen Fremdschlüssel auf organization(id) umhängen
  for v_fk in
    select c.conrelid::regclass as tabelle, a.attname as spalte
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.organization'::regclass
       and array_length(c.conkey, 1) = 1
       and c.conrelid not in ('public.organization_merge'::regclass,
                              'public.organization_external_ref'::regclass,
                              'public.address'::regclass,
                              'public.contact'::regclass,
                              'public.user_role'::regclass)
  loop
    execute format('update %s set %I = $1 where %I = $2', v_fk.tabelle, v_fk.spalte, v_fk.spalte)
      using p_survivor, p_loser;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_umgehaengt := v_umgehaengt || jsonb_build_object(v_fk.tabelle::text || '.' || v_fk.spalte, v_n);
    end if;
  end loop;

  -- 5) Nummern des Verlierers freigeben, Gewinner mit leeren Feldern anreichern
  update public.organization set customer_number = null, supplier_number = null where id = p_loser;

  update public.organization s set
    legal_name        = coalesce(s.legal_name, v_l.legal_name),
    customer_number   = coalesce(s.customer_number, v_l.customer_number),
    supplier_number   = coalesce(s.supplier_number, v_l.supplier_number),
    vat_id            = coalesce(s.vat_id, v_l.vat_id),
    vat_id_valid      = coalesce(s.vat_id_valid, v_l.vat_id_valid),
    vat_id_checked_at = coalesce(s.vat_id_checked_at, v_l.vat_id_checked_at),
    email             = coalesce(s.email, v_l.email),
    invoice_email     = coalesce(s.invoice_email, v_l.invoice_email),
    phone             = coalesce(s.phone, v_l.phone),
    website           = coalesce(s.website, v_l.website),
    payment_terms_id  = coalesce(s.payment_terms_id, v_l.payment_terms_id),
    price_group_id    = coalesce(s.price_group_id, v_l.price_group_id),
    notes             = case when s.notes is null then v_l.notes
                             when v_l.notes is null or v_l.notes = s.notes then s.notes
                             else s.notes || E'\n' || v_l.notes end,
    -- Vorkontierung: Gewinner behält seine, sonst die des Verlierers (inkl. Herkunft/Konfidenz)
    vorkontierung_source = case when s.default_expense_account is null and s.default_revenue_account is null
                                then v_l.vorkontierung_source else s.vorkontierung_source end,
    vorkontierung_confidence = case when s.default_expense_account is null and s.default_revenue_account is null
                                    then v_l.vorkontierung_confidence else s.vorkontierung_confidence end,
    default_expense_account = coalesce(s.default_expense_account, v_l.default_expense_account),
    default_revenue_account = coalesce(s.default_revenue_account, v_l.default_revenue_account),
    default_payment_method  = coalesce(s.default_payment_method, v_l.default_payment_method),
    foreign_supply_kind     = coalesce(s.foreign_supply_kind, v_l.foreign_supply_kind),
    gutschriftverfahren     = s.gutschriftverfahren or v_l.gutschriftverfahren,
    relation         = case when s.relation = v_l.relation then s.relation else 'both'::org_relation end,
    customer_segment = case
                         when s.customer_segment is null then v_l.customer_segment
                         when v_l.customer_segment is null then s.customer_segment
                         when s.customer_segment = v_l.customer_segment then s.customer_segment
                         else 'mixed'
                       end,
    updated_at = now()
  where s.id = p_survivor;

  -- 6) Protokoll (Verlierer komplett als Snapshot) + Löschen
  insert into public.organization_merge (survivor_id, loser_id, loser_snapshot, merged_by, note)
  values (p_survivor, p_loser, to_jsonb(v_l), coalesce(auth.uid(), p_merged_by),
          case when v_umgehaengt = '{}'::jsonb then null else v_umgehaengt::text end);

  delete from public.organization where id = p_loser;

  return jsonb_build_object('survivor', p_survivor, 'loser', p_loser,
                            'auth_system', v_auth_system, 'umgehaengt', v_umgehaengt);
end;
$$;

revoke all on function public.merge_organization(uuid, uuid, uuid) from public;

-- alte Signatur bleibt als Hülle erhalten (gleiche Logik)
create or replace function public.merge_organization(p_survivor uuid, p_loser uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.merge_organization(p_survivor, p_loser, null::uuid) $$;

revoke all on function public.merge_organization(uuid, uuid) from public;

-- Anzahl verknüpfter Datensätze je Tabelle.Spalte, z. B. {"incoming_document.supplier_organization_id": 12}
create or replace function public.organization_verweise(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fk record;
  v_n bigint;
  v_erg jsonb := '{}'::jsonb;
begin
  -- Service-Role (auth.uid() null) darf; angemeldete Nutzer nur als Mitarbeiter; anon hat kein execute
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'kein Zugriff';
  end if;
  for v_fk in
    select c.conrelid::regclass as tabelle, a.attname as spalte
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.organization'::regclass
       and array_length(c.conkey, 1) = 1
       and c.conrelid <> 'public.organization_merge'::regclass
  loop
    execute format('select count(*) from %s where %I = $1', v_fk.tabelle, v_fk.spalte) into v_n using p_id;
    if v_n > 0 then
      v_erg := v_erg || jsonb_build_object(v_fk.tabelle::text || '.' || v_fk.spalte, v_n);
    end if;
  end loop;
  return v_erg;
end;
$$;

revoke all on function public.organization_verweise(uuid) from public;
grant execute on function public.organization_verweise(uuid) to authenticated;
