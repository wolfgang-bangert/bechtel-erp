-- ============================================================================
-- Eingangsbelege (Kreditoren): Erfassung aus dem Postfach, positionsgenaue
-- Extraktion, Prüfung/Kontierung, später DATEV-Export.
-- ============================================================================

create table public.incoming_document (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null default 'email'
                           check (source in ('email', 'upload', 'api')),
  doc_type               text not null default 'invoice'
                           check (doc_type in ('invoice', 'credit_note', 'receipt', 'unknown')),
  status                 text not null default 'captured'
                           check (status in ('captured', 'extracted', 'reviewed', 'booked', 'exported', 'rejected')),

  -- Herkunft E-Mail
  email_message_id       text,
  email_from             text,
  email_subject          text,
  email_date             timestamptz,

  -- Datei
  file_name              text,
  pdf_storage_key        text,
  file_sha256            text,
  dedup_key              text not null unique,

  -- extrahierte / geprüfte Kopfdaten
  supplier_organization_id uuid references public.organization (id) on delete set null,
  supplier_name          text,
  supplier_vat_id        text,
  supplier_iban          text,
  doc_number             text,
  doc_date               date,
  service_date           date,
  due_date               date,
  currency               char(3) not null default 'EUR',
  net_amount             numeric(14,2),
  tax_amount             numeric(14,2),
  gross_amount           numeric(14,2),
  tax_breakdown          jsonb,

  -- Kontierung
  ledger_account         text,
  tax_code_id            uuid references public.tax_code (id) on delete set null,
  cost_center_id         uuid references public.cost_center (id) on delete set null,
  payment_status         text not null default 'open' check (payment_status in ('open', 'paid')),
  paid_at                date,

  -- Extraktions-Meta
  extraction             jsonb,
  extraction_model       text,
  extraction_confidence  numeric(4,3),
  extracted_at           timestamptz,
  reviewed_by            uuid,
  reviewed_at            timestamptz,
  notes                  text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index incoming_document_status_idx on public.incoming_document (status);
create index incoming_document_supplier_idx on public.incoming_document (supplier_organization_id);
create index incoming_document_date_idx on public.incoming_document (doc_date);

create table public.incoming_document_item (
  id                    uuid primary key default gen_random_uuid(),
  incoming_document_id  uuid not null references public.incoming_document (id) on delete cascade,
  position              integer,
  description           text,
  quantity              numeric(14,3),
  unit_price            numeric(14,4),
  tax_rate              numeric(6,3),
  net_amount            numeric(14,2),
  ledger_account        text,
  cost_center_id        uuid references public.cost_center (id) on delete set null,
  raw                   jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index incoming_document_item_doc_idx on public.incoming_document_item (incoming_document_id);

do $$
declare t text;
begin
  foreach t in array array['incoming_document', 'incoming_document_item'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy id_read  on public.incoming_document for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
create policy id_write on public.incoming_document for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

create policy idi_read  on public.incoming_document_item for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
create policy idi_write on public.incoming_document_item for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
