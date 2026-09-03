-- ============================================================================
-- Druck-Dashboard: Druckjobs + Batches als Anker für die Maschinenplanung.
--
--   Druckauftrag (portal_order, resolved)
--     └─ druckjob     1 pro bedrucktem Bauteil (Graukarton/Graupappe → kein Job)
--   druckjob.batch_id → druck_batch   (auftragsübergreifend gesammelt)
--
-- Batch-Schlüssel: druckverfahren | cello (keine/matt/glanz) | papier | druckbogen.
-- Cello-Batches tragen den Extra-Arbeitsschritt „Cellophanieren".
-- ============================================================================

-- Materialregel: trägt die erzeugte Zeile die Cello-Veredelung? (nur Umschlag/Deckel)
alter table public.opri_material_regel
  add column if not exists traegt_cello boolean not null default false;

-- flux-Produktname mit Cascade wie flux_template (NULL = erben bzw. flux_template)
alter table public.opri_produkt_gruppe add column if not exists flux_product text;
alter table public.opri_stammartikel  add column if not exists flux_product text;

-- ---------------------------------------------------------------- Batch
create table public.druck_batch (
  id             uuid primary key default gen_random_uuid(),
  nummer         text not null unique,
  schluessel     text not null,                       -- normalisierter Gruppierungsschlüssel
  druckverfahren text,                                -- 'digital' | 'offset' | NULL
  cello          text not null default 'keine' check (cello in ('keine', 'matt', 'glanz')),
  cello_seiten   smallint not null default 1 check (cello_seiten in (1, 2)),
  papier         text,
  druckbogen     text,
  status         text not null default 'offen'
                 check (status in ('offen', 'bereit', 'an_flux', 'im_druck',
                                   'gedruckt', 'cellophaniert', 'abgeschlossen', 'storniert')),
  printer_name   text,                                -- flux-Drucker
  plan_start     timestamptz,
  plan_ende      timestamptz,
  flux_order_id  text,
  an_flux_at     timestamptz,
  gedruckt_at    timestamptz,
  cello_erledigt_at timestamptz,
  notiz          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index druck_batch_status_idx on public.druck_batch (status);
create index druck_batch_schluessel_idx on public.druck_batch (schluessel);

-- ---------------------------------------------------------------- Druckjob
create table public.druckjob (
  id                 uuid primary key default gen_random_uuid(),
  portal_order_id    uuid not null references public.portal_order (id) on delete cascade,
  batch_id           uuid references public.druck_batch (id) on delete set null,
  bauteil            text not null,                   -- 'Inhalt', 'Umschlag', 'Kalendarium', …
  quelle_regel       text,                            -- Name der Materialregel-Zeile
  papier             text,
  papier_material_id uuid references public.material (id) on delete set null,
  farbigkeit         text,                            -- '4/4', '4/0', '1/0'
  format             text,                            -- 'A4'
  druckbogen         text,                            -- 'SRA3'
  nutzen             integer,
  netto_bogen        integer,
  auflage            integer not null default 0,      -- order.quantity
  zuschuss           integer not null default 0,      -- Makulatur/Zuschuss (Regel folgt später)
  cello              text not null default 'keine' check (cello in ('keine', 'matt', 'glanz')),
  cello_seiten       smallint not null default 1 check (cello_seiten in (1, 2)),
  flux_product       text,
  flux_services      jsonb not null default '{}'::jsonb,
  pdf_storage_key    text,
  pdf_seiten         text,                            -- '1-2', '3-52'
  status             text not null default 'offen'
                     check (status in ('offen', 'in_batch', 'an_flux', 'im_druck',
                                       'gedruckt', 'cellophaniert', 'fertig', 'storniert')),
  flux_order_id      text,
  flux_order_item_id text,
  notiz              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index druckjob_order_idx on public.druckjob (portal_order_id);
create index druckjob_batch_idx on public.druckjob (batch_id);
create index druckjob_status_idx on public.druckjob (status);

-- ---------------------------------------------------------------- Trigger + RLS
do $$
declare t text;
begin
  foreach t in array array['druck_batch', 'druckjob'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','production']::app_role[]))
        with check (public.has_any_role(array['admin','office','production']::app_role[]));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Nummernkreis
insert into public.number_sequence (key, prefix, padding, period, current_value) values
  ('druck_batch', 'DB-', 5, 'year', 0)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- flux-Basiskonfig
-- Gerüst für createOrder (submitter/delivery/price). Pro Auftrag überschreibbar.
insert into public.setting (key, value, scope) values (
  'flux_createorder_base',
  jsonb_build_object(
    'projectName', 'onlineprinters',
    'orderNote', 'online Auftrag',
    'deliveryType', 'Bechtel Lieferservice',
    'submitterAddress', jsonb_build_object(
      'name', 'Bechtel Druck GmbH & Co. KG',
      'shortName', 'opri'
    ),
    'price', jsonb_build_object(
      'currency', 'EUR', 'subTotal', 0, 'delivery', 0,
      'deliveryVat', 0, 'totalNet', 0, 'total', 0
    )
  ),
  'company'
)
on conflict (key) do nothing;
