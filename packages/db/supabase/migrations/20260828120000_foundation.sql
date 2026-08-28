-- ============================================================================
-- werk ERP — Slice 1: Fundament
-- Auth/Rollen/RLS, Stammdaten-Kern, Steuer- & Nummernkreis-Basis,
-- Revisionssicherheit (Audit-Log), Keyline-Sync-Status.
--
-- Ziel: die "teuer zu ändernden" Grundlagen festlegen. Belegmodule (Rechnung,
-- Zeiterfassung, Shop, ...) folgen in eigenen Migrationen.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type app_user_kind as enum ('employee', 'customer_contact', 'system');

create type app_role as enum (
  'admin',       -- volle Rechte inkl. Konfiguration
  'office',      -- Vertrieb / Auftragsbearbeitung
  'accounting',  -- Fakturierung, Zahlungen, DATEV
  'production',  -- Produktion, Zeiterfassungs-Verwaltung, Material
  'shipping',    -- Versand: Kommissionierung, Lieferscheine, Versandlabels
  'employee',    -- Mitarbeiter-App: eigene Daten
  'customer',    -- Kundenportal: nur eigene Organisation
  'supplier'     -- Lieferantenportal: nur eigene Organisation (Slice 8)
);

create type address_kind as enum ('billing', 'shipping', 'general');

create type org_relation as enum ('customer', 'supplier', 'both');

create type tax_treatment as enum (
  'standard_de',            -- Inland 19 % / 7 %
  'reverse_charge_eu',      -- EU B2B, Steuerschuld beim Empfänger
  'intra_community_supply', -- innergemeinschaftliche Lieferung (Ware), steuerfrei
  'export_third_country',   -- Ausfuhr Drittland (CH), steuerfrei
  'tax_free_other'
);

-- ----------------------------------------------------------------------------
-- Gemeinsame Trigger-Funktion: updated_at
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Audit-Log + Trigger-Funktion
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id            bigint generated always as identity primary key,
  table_name    text        not null,
  row_id        text        not null,
  action        text        not null check (action in ('insert', 'update', 'delete')),
  actor_user_id uuid,
  changed_at    timestamptz not null default now(),
  before        jsonb,
  after         jsonb,
  context       jsonb
);

create index audit_log_table_row_idx on public.audit_log (table_name, row_id);
create index audit_log_changed_at_idx on public.audit_log (changed_at);

create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid;
  v_before jsonb;
  v_after  jsonb;
  v_row_id text;
begin
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  if tg_op <> 'INSERT' then v_before := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_after  := to_jsonb(new); end if;

  -- schlüssel-agnostisch: id, sonst key/code, sonst Hash der Zeile
  v_row_id := coalesce(
    (coalesce(v_after, v_before) ->> 'id'),
    (coalesce(v_after, v_before) ->> 'key'),
    (coalesce(v_after, v_before) ->> 'code'),
    md5(coalesce(v_after, v_before)::text)
  );

  insert into public.audit_log (table_name, row_id, action, actor_user_id, before, after)
  values (tg_table_name, v_row_id, lower(tg_op), v_actor, v_before, v_after);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Bequemer Helfer, um Trigger konsistent zu setzen
create or replace function public.attach_standard_triggers(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger %I before update on %s for each row execute function public.tg_set_updated_at()',
    'set_updated_at', p_table);
  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function public.tg_audit()',
    'audit', p_table);
end;
$$;

-- ============================================================================
-- Modul 1 — Plattform & Auth
-- ============================================================================

create table public.app_user (
  id            uuid primary key references auth.users (id) on delete cascade,
  kind          app_user_kind not null default 'employee',
  display_name  text,
  email         citext,
  is_active     boolean       not null default true,
  last_login_at timestamptz,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

-- organization wird gleich angelegt; user_role verweist darauf.
-- Herkunft/Spiegelung: siehe organization_external_ref (mehrere Quellsysteme:
-- Keyline = Akzidenz, Ninox = Kalender-Vertrieb, Xano = Altbestand Firmen).
create table public.organization (
  id                     uuid primary key default gen_random_uuid(),
  relation               org_relation  not null default 'customer',
  customer_segment       text          check (customer_segment in ('akzidenz', 'kalender', 'mixed')),
  name                   text          not null,
  legal_name             text,
  customer_number        text unique,
  supplier_number        text unique,
  vat_id                 text,
  vat_id_valid           boolean,
  vat_id_checked_at      timestamptz,
  tax_country            text          not null default 'DE',
  default_tax_treatment  tax_treatment not null default 'standard_de',
  payment_terms_id       uuid,
  price_group_id         uuid,
  dunning_enabled        boolean       not null default true,
  email                  text,
  phone                  text,
  website                text,
  notes                  text,
  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now()
);

create table public.user_role (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid     not null references public.app_user (id) on delete cascade,
  role            app_role not null,
  organization_id uuid     references public.organization (id) on delete cascade,
  created_at      timestamptz not null default now()
);

-- ein Datensatz je (user, role, org); NULL-org eindeutig behandeln
create unique index user_role_uq
  on public.user_role (
    user_id,
    role,
    (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

create table public.number_sequence (
  key           text primary key,
  prefix        text   not null default '',
  suffix        text   not null default '',
  padding       int    not null default 4,
  period        text   not null default 'year' check (period in ('none', 'year')),
  period_value  text   not null default '',
  current_value bigint not null default 0,
  updated_at    timestamptz not null default now()
);

-- Lückenlose Nummernvergabe mit Zeilensperre, optional Jahres-Reset.
create or replace function public.next_number(p_key text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.number_sequence;
  v_period text;
  v_next   bigint;
begin
  select * into r from public.number_sequence where key = p_key for update;
  if not found then
    raise exception 'Unbekannter Nummernkreis: %', p_key;
  end if;

  v_period := case when r.period = 'year' then to_char(p_date, 'YYYY') else '' end;

  if r.period = 'year' and r.period_value is distinct from v_period then
    update public.number_sequence
       set current_value = 1, period_value = v_period, updated_at = now()
     where key = p_key
     returning current_value into v_next;
  else
    update public.number_sequence
       set current_value = current_value + 1, updated_at = now()
     where key = p_key
     returning current_value into v_next;
  end if;

  return r.prefix
      || case when r.period = 'year' then v_period || '-' else '' end
      || lpad(v_next::text, r.padding, '0')
      || r.suffix;
end;
$$;

create table public.setting (
  key        text primary key,
  value      jsonb not null,
  scope      text  not null default 'company',
  updated_at timestamptz not null default now()
);

-- Fortschritt je Fremdsystem + Ressource (Keyline, Ninox, Xano-Import, ...)
create table public.external_sync_state (
  system      text not null check (system in ('keyline', 'ninox', 'xano')),
  resource    text not null,
  last_run_at timestamptz,
  last_cursor text,
  last_status text check (last_status in ('ok', 'error')),
  error       text,
  updated_at  timestamptz not null default now(),
  primary key (system, resource)
);

create table public.file (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in (
                    'print_data', 'proof', 'incoming_document',
                    'invoice_pdf', 'invoice_xml', 'attachment', 'export')),
  storage_path    text not null,
  filename        text not null,
  mime            text,
  size_bytes      bigint,
  organization_id uuid references public.organization (id) on delete set null,
  uploaded_by     uuid references public.app_user (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index file_org_idx on public.file (organization_id);

-- ============================================================================
-- Modul 2 — Stammdaten
-- ============================================================================

create table public.payment_terms (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  net_days         int  not null default 14,
  discount_percent numeric(6,3) not null default 0,
  discount_days    int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.price_group (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  discount_percent numeric(6,3) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.organization
  add constraint organization_payment_terms_fk
    foreign key (payment_terms_id) references public.payment_terms (id) on delete set null,
  add constraint organization_price_group_fk
    foreign key (price_group_id) references public.price_group (id) on delete set null;

-- Verknüpfung einer Organisation mit ihren Datensätzen in Fremdsystemen.
-- Kunden liegen aktuell verteilt in Keyline (Akzidenz), Ninox (Kalender-Vertrieb)
-- und Xano (Altbestand). Alle werden in "organization" zusammengeführt; hier
-- steht, welches System für diese Organisation führend ist.
create table public.organization_external_ref (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organization (id) on delete cascade,
  system           text not null check (system in ('keyline', 'ninox', 'xano', 'werk')),
  external_id      text not null,
  is_authoritative boolean not null default false,
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (system, external_id)
);

create index organization_external_ref_org_idx
  on public.organization_external_ref (organization_id);
-- höchstens eine führende Quelle je Organisation
create unique index organization_external_ref_one_auth
  on public.organization_external_ref (organization_id) where is_authoritative;

create table public.address (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  kind            address_kind not null default 'general',
  is_default      boolean not null default false,
  line1           text not null,
  line2           text,
  zip             text,
  city            text,
  country         text not null default 'DE',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index address_org_idx on public.address (organization_id);
create unique index address_one_default_per_kind
  on public.address (organization_id, kind) where is_default;

create table public.contact (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  app_user_id     uuid references public.app_user (id) on delete set null,
  first_name      text not null,
  last_name       text not null,
  email           citext,
  phone           text,
  position        text,
  is_primary      boolean not null default false,
  keyline_id      text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index contact_org_idx on public.contact (organization_id);
create index contact_app_user_idx on public.contact (app_user_id);

create table public.cost_center (
  id         uuid primary key default gen_random_uuid(),
  number     text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.working_time_model (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  minutes_per_weekday jsonb not null default '{"mon":480,"tue":480,"wed":480,"thu":480,"fri":480,"sat":0,"sun":0}'::jsonb,
  break_rule          jsonb not null default '{"gt_6h":30,"gt_9h":45}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.employee (
  id                        uuid primary key default gen_random_uuid(),
  app_user_id               uuid unique references public.app_user (id) on delete set null,
  personnel_number          text not null unique,
  first_name                text not null,
  last_name                 text not null,
  hire_date                 date,
  leave_date                date,
  weekly_hours              numeric(5,2) not null default 40,
  working_time_model_id     uuid references public.working_time_model (id) on delete set null,
  vacation_entitlement_days numeric(5,2) not null default 30,
  cost_center_id            uuid references public.cost_center (id) on delete set null,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ============================================================================
-- Modul 3 — Buchhaltungs-Stammdaten
-- ============================================================================

-- tax_code und ledger_account sind voll benutzerverwaltbar ("Kontenverwaltung"
-- im Admin-ERP). is_system markiert die mitgelieferten Einträge: umbenennbar und
-- deaktivierbar, aber nicht löschbar (Trigger tg_protect_system_row).
create table public.tax_code (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  rate          numeric(6,3) not null default 0,
  treatment     tax_treatment not null,
  datev_tax_key text,
  direction     text not null check (direction in ('output', 'input')),
  is_system     boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.ledger_account (
  id                  uuid primary key default gen_random_uuid(),
  number              text not null unique,
  name                text not null,
  kind                text not null check (kind in ('revenue', 'expense', 'asset', 'liability', 'other')),
  default_tax_code_id uuid references public.tax_code (id) on delete set null,
  is_system           boolean not null default false,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function public.tg_protect_system_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'Systemeintrag (is_system) kann nicht gelöscht werden: %', old.id;
  end if;
  return old;
end;
$$;

create trigger protect_system_row before delete on public.tax_code
  for each row execute function public.tg_protect_system_row();
create trigger protect_system_row before delete on public.ledger_account
  for each row execute function public.tg_protect_system_row();

create table public.datev_settings (
  id                   int primary key default 1 check (id = 1),
  berater_nr           text,
  mandanten_nr         text,
  skr                  text not null default '03',
  sachkonto_length     int  not null default 4,
  personenkonto_length int  not null default 5,
  fiscal_year_start    text not null default '01-01',
  updated_at           timestamptz not null default now()
);

-- ============================================================================
-- RLS-Hilfsfunktionen
-- ============================================================================
create or replace function public.has_role(p_role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_role ur
    where ur.user_id = auth.uid() and ur.role = p_role
  );
$$;

create or replace function public.has_any_role(p_roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_role ur
    where ur.user_id = auth.uid() and ur.role = any (p_roles)
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(
    array['admin', 'office', 'accounting', 'production', 'shipping', 'employee']::app_role[]
  );
$$;

create or replace function public.customer_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.user_role
  where user_id = auth.uid()
    and role = 'customer'
    and organization_id is not null;
$$;

-- ============================================================================
-- Trigger + RLS aktivieren
-- ============================================================================
do $$
declare
  t text;
  audited text[] := array[
    'app_user', 'organization', 'organization_external_ref', 'user_role',
    'address', 'contact', 'payment_terms', 'price_group', 'cost_center',
    'working_time_model', 'employee', 'tax_code', 'ledger_account',
    'number_sequence', 'setting', 'datev_settings'
  ];
  all_tables text[] := array[
    'app_user', 'organization', 'organization_external_ref', 'user_role',
    'number_sequence', 'setting', 'external_sync_state', 'file',
    'payment_terms', 'price_group', 'address', 'contact', 'cost_center',
    'working_time_model', 'employee', 'tax_code', 'ledger_account',
    'datev_settings', 'audit_log'
  ];
begin
  foreach t in array audited loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
  end loop;

  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Policies
-- Grundmuster:
--   * Mitarbeiter (is_staff) sehen/bearbeiten operative Stammdaten
--   * Konfiguration (Steuer, Konten, Nummernkreise, DATEV) nur admin/accounting
--   * Kunden sehen nur ihre Organisation
--   * service_role (Worker/Server) umgeht RLS ohnehin
-- ----------------------------------------------------------------------------

-- organization
create policy org_staff_read   on public.organization for select using (public.is_staff());
create policy org_staff_write  on public.organization for all
  using (public.has_any_role(array['admin','office','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','office','accounting']::app_role[]));
create policy org_customer_read on public.organization for select
  using (id in (select public.customer_org_ids()));

-- address / contact: staff voll, Kunde nur eigene Organisation
create policy address_staff_all on public.address for all
  using (public.is_staff()) with check (public.is_staff());
create policy address_customer_read on public.address for select
  using (organization_id in (select public.customer_org_ids()));

create policy contact_staff_all on public.contact for all
  using (public.is_staff()) with check (public.is_staff());
create policy contact_customer_read on public.contact for select
  using (organization_id in (select public.customer_org_ids()));

-- reine Stammdaten: staff lesen, admin/office schreiben
create policy pt_read  on public.payment_terms for select using (public.is_staff());
create policy pt_write on public.payment_terms for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy pg_read  on public.price_group for select using (public.is_staff());
create policy pg_write on public.price_group for all
  using (public.has_any_role(array['admin','office','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','office','accounting']::app_role[]));

create policy cc_read  on public.cost_center for select using (public.is_staff());
create policy cc_write on public.cost_center for all
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy wtm_read  on public.working_time_model for select using (public.is_staff());
create policy wtm_write on public.working_time_model for all
  using (public.has_any_role(array['admin','production']::app_role[]))
  with check (public.has_any_role(array['admin','production']::app_role[]));

-- employee: staff lesen, admin/production schreiben, Mitarbeiter sieht sich selbst
create policy emp_staff_read on public.employee for select using (public.is_staff());
create policy emp_self_read  on public.employee for select
  using (app_user_id = auth.uid());
create policy emp_write on public.employee for all
  using (public.has_any_role(array['admin','production']::app_role[]))
  with check (public.has_any_role(array['admin','production']::app_role[]));

-- Konfiguration: admin/accounting
create policy tax_read  on public.tax_code for select using (public.is_staff());
create policy tax_write on public.tax_code for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy la_read  on public.ledger_account for select using (public.is_staff());
create policy la_write on public.ledger_account for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy ns_admin on public.number_sequence for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy ds_admin on public.datev_settings for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy setting_read  on public.setting for select using (public.is_staff());
create policy setting_write on public.setting for all
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy ess_admin on public.external_sync_state for all
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- organization_external_ref: staff lesen, admin/office/accounting pflegen
create policy oer_staff_read on public.organization_external_ref for select
  using (public.is_staff());
create policy oer_write on public.organization_external_ref for all
  using (public.has_any_role(array['admin','office','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','office','accounting']::app_role[]));

-- audit_log: nur lesen, nur admin/accounting (Schreiben passiert via SECURITY DEFINER Trigger)
create policy audit_read on public.audit_log for select
  using (public.has_any_role(array['admin','accounting']::app_role[]));

-- app_user / user_role
create policy au_self_read  on public.app_user for select using (id = auth.uid());
create policy au_staff_read on public.app_user for select using (public.is_staff());
create policy au_admin_write on public.app_user for all
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy ur_self_read on public.user_role for select using (user_id = auth.uid());
create policy ur_admin_all on public.user_role for all
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- file: staff voll, Kunde nur eigene Organisation
create policy file_staff_all on public.file for all
  using (public.is_staff()) with check (public.is_staff());
create policy file_customer_read on public.file for select
  using (organization_id in (select public.customer_org_ids()));

-- ============================================================================
-- Referenzdaten (landen auch in prod)
-- ============================================================================

insert into public.datev_settings (id) values (1) on conflict do nothing;

insert into public.number_sequence (key, prefix, padding, period, current_value) values
  ('quote',           'AN-', 5, 'year', 0),
  ('order',           'AB-', 5, 'year', 0),
  ('invoice',         'RE-', 5, 'year', 0),
  ('credit_note',     'GS-', 5, 'year', 0),
  ('delivery_note',   'LS-', 5, 'year', 0),
  ('dunning',         'MA-', 5, 'year', 0),
  ('purchase_order',  'BE-', 5, 'year', 0)
on conflict (key) do nothing;

insert into public.number_sequence (key, prefix, padding, period, current_value) values
  ('customer_number', '', 5, 'none', 10000),
  ('supplier_number', '', 5, 'none', 70000)
on conflict (key) do nothing;

-- Steuerschlüssel (Sätze/BU-Schlüssel mit Steuerberater bestätigen).
-- is_system = true: nicht löschbar; eigene Schlüssel im Admin frei anlegbar.
insert into public.tax_code (code, name, rate, treatment, direction, is_system) values
  ('UST19',      'Umsatzsteuer 19 %',                              19.0, 'standard_de',            'output', true),
  ('UST7',       'Umsatzsteuer 7 %',                                7.0, 'standard_de',            'output', true),
  ('RC_EU',      'EU B2B - Reverse Charge (Paragraf 13b, 0 %)',     0.0, 'reverse_charge_eu',      'output', true),
  ('IGL_EU',     'Innergemeinschaftliche Lieferung (steuerfrei)',   0.0, 'intra_community_supply', 'output', true),
  ('AUSFUHR_CH', 'Steuerfreie Ausfuhrlieferung Drittland',          0.0, 'export_third_country',   'output', true),
  ('VST19',      'Vorsteuer 19 %',                                 19.0, 'standard_de',            'input',  true),
  ('VST7',       'Vorsteuer 7 %',                                   7.0, 'standard_de',            'input',  true)
on conflict (code) do nothing;

-- Sachkonten SKR03 (Auswahl; im Admin frei erweiterbar = "Kontenverwaltung").
insert into public.ledger_account (number, name, kind, is_system) values
  ('8400', 'Erlöse 19 % USt',                           'revenue', true),
  ('8300', 'Erlöse 7 % USt',                            'revenue', true),
  ('8336', 'Erlöse steuerfreie innergem. Lieferung',    'revenue', true),
  ('8120', 'Steuerfreie Umsätze Ausfuhr (Drittland)',   'revenue', true),
  ('8200', 'Erlöse',                                     'revenue', true),
  ('3400', 'Wareneingang 19 % Vorsteuer',               'expense', true),
  ('4600', 'Werbekosten',                                'expense', true),
  ('4900', 'Sonstige betriebliche Aufwendungen',        'expense', true),
  ('4930', 'Bürobedarf',                                 'expense', true),
  ('4980', 'Betriebsbedarf',                             'expense', true)
on conflict (number) do nothing;

-- Standard-Zahlungsbedingungen
insert into public.price_group (name, discount_percent) values ('Standard', 0)
on conflict do nothing;

-- Firmen-Grundeinstellungen (Platzhalter – im Admin ausfüllen)
insert into public.setting (key, value) values
  ('company.profile', '{"name":"","address":{},"vat_id":"","tax_number":"","bank":{}}'::jsonb),
  ('invoice.defaults', '{"footer":"","payment_terms_id":null,"einvoice_format":"zugferd"}'::jsonb)
on conflict (key) do nothing;
