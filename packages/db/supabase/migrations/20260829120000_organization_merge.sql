-- ============================================================================
-- Organisations-Zusammenführung (Dubletten).
-- merge_organization() hängt alle Kind-Datensätze des Verlierers auf den
-- Gewinner um, reichert leere Felder an, protokolliert und löscht den Verlierer.
-- Läuft atomar (eine Transaktion). Nur via service_role / RPC.
-- ============================================================================

create table public.organization_merge (
  id             uuid primary key default gen_random_uuid(),
  survivor_id    uuid not null references public.organization (id) on delete cascade,
  loser_id       uuid not null,
  loser_snapshot jsonb not null,
  merged_by      uuid,
  merged_at      timestamptz not null default now(),
  note           text
);

create index organization_merge_survivor_idx on public.organization_merge (survivor_id);

alter table public.organization_merge enable row level security;

create policy org_merge_read on public.organization_merge for select
  using (public.has_any_role(array['admin', 'accounting', 'office']::app_role[]));

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

  -- 1) Fremdsystem-Refs umhaengen (erst alle des Verlierers auf non-auth)
  update public.organization_external_ref
     set is_authoritative = false
   where organization_id = p_loser;
  update public.organization_external_ref
     set organization_id = p_survivor
   where organization_id = p_loser;

  select case
    when exists (select 1 from public.organization_external_ref
                  where organization_id = p_survivor and system = 'keyline') then 'keyline'
    when exists (select 1 from public.organization_external_ref
                  where organization_id = p_survivor and system = 'ninox') then 'ninox'
    else (select system from public.organization_external_ref
           where organization_id = p_survivor order by created_at limit 1)
  end into v_auth_system;

  update public.organization_external_ref set is_authoritative = false
   where organization_id = p_survivor;
  update public.organization_external_ref set is_authoritative = true
   where id = (
     select id from public.organization_external_ref
      where organization_id = p_survivor and system = v_auth_system
      order by created_at limit 1
   );

  -- 2) Adressen
  update public.address set is_default = false where organization_id = p_loser;
  update public.address set organization_id = p_survivor where organization_id = p_loser;
  if not exists (select 1 from public.address
                  where organization_id = p_survivor and is_default) then
    update public.address set is_default = true
     where id = (select id from public.address
                  where organization_id = p_survivor order by created_at limit 1);
  end if;

  -- 3) Kontakte
  update public.contact set is_primary = false where organization_id = p_loser;
  update public.contact set organization_id = p_survivor where organization_id = p_loser;
  if not exists (select 1 from public.contact
                  where organization_id = p_survivor and is_primary) then
    update public.contact set is_primary = true
     where id = (select id from public.contact
                  where organization_id = p_survivor order by created_at limit 1);
  end if;

  -- 4) user_role: kollidierende Zeilen entfernen, Rest umhaengen
  delete from public.user_role ul
   using public.user_role us
   where ul.organization_id = p_loser
     and us.organization_id = p_survivor
     and ul.user_id = us.user_id
     and ul.role = us.role;
  update public.user_role set organization_id = p_survivor where organization_id = p_loser;

  -- 5) Dateien
  update public.file set organization_id = p_survivor where organization_id = p_loser;

  -- (weitere Kindtabellen hier ergaenzen: order, quote, invoice, ...)

  -- 6) Nummern des Verlierers freigeben, dann Gewinner anreichern
  update public.organization set customer_number = null, supplier_number = null
   where id = p_loser;

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
    relation         = case when s.relation = v_l.relation
                            then s.relation else 'both'::org_relation end,
    customer_segment = case
                         when s.customer_segment is null then v_l.customer_segment
                         when v_l.customer_segment is null then s.customer_segment
                         when s.customer_segment = v_l.customer_segment then s.customer_segment
                         else 'mixed'
                       end,
    updated_at = now()
  where s.id = p_survivor;

  -- 7) Protokoll + Loeschen
  insert into public.organization_merge (survivor_id, loser_id, loser_snapshot, merged_by)
  values (p_survivor, p_loser, to_jsonb(v_l), auth.uid());

  delete from public.organization where id = p_loser;

  return jsonb_build_object(
    'survivor', p_survivor, 'loser', p_loser, 'auth_system', v_auth_system
  );
end;
$$;

revoke all on function public.merge_organization(uuid, uuid) from public;
