-- ============================================================================
-- Eingangsrechnung: Fälligkeiten (Skonto/Netto), abweichender Zahlungsempfänger,
-- Kontierung auf Positionsebene + anteilige Zuordnung je Position
-- (Auftrag / Material / Kostenstelle).
-- ============================================================================

-- --- Kopf: Zahlungsziele ---------------------------------------------------
alter table public.incoming_document
  add column if not exists net_due_date     date,
  add column if not exists discount_date    date,
  add column if not exists discount_percent numeric(6,3),
  add column if not exists discount_amount  numeric(14,2);

comment on column public.incoming_document.due_date is
  'Nettofälligkeit (= net_due_date). Bleibt aus Kompatibilität erhalten.';
comment on column public.incoming_document.discount_date is
  'Letzter Tag für Zahlung mit Skonto.';

-- --- Kopf: abweichender Zahlungsempfänger -------------------------------------
alter table public.incoming_document
  add column if not exists payee_differs boolean not null default false,
  add column if not exists payee_name    text,
  add column if not exists payee_iban    text,
  add column if not exists payee_reason  text;   -- 'Insolvenzverwalter' | 'Abtretung/Factoring' | 'Inkasso' | ...

-- --- Kopf: Kontierung bleibt Default für alle Positionen --------------------
-- (ledger_account / tax_code_id / cost_center_id existieren bereits)

-- --- Position: eigene Kontierung überschreibt den Kopf-Default ---------------
alter table public.incoming_document_item
  add column if not exists tax_code_id  uuid references public.tax_code (id) on delete set null,
  add column if not exists material_ref text;   -- Freitext bis Materialverwaltung steht

-- --- Position: anteilige Zuordnung -----------------------------------------
create table if not exists public.incoming_document_allocation (
  id                        uuid primary key default gen_random_uuid(),
  incoming_document_item_id uuid not null
                              references public.incoming_document_item (id) on delete cascade,
  link_type                 text not null
                              check (link_type in ('sales_order', 'material', 'cost_center')),
  sales_order_id            uuid references public.sales_order (id) on delete set null,
  material_ref              text,
  cost_center_id            uuid references public.cost_center (id) on delete set null,
  amount                    numeric(14,2) not null default 0,   -- Netto-Anteil dieser Position
  note                      text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists incoming_document_allocation_item_idx
  on public.incoming_document_allocation (incoming_document_item_id);
create index if not exists incoming_document_allocation_order_idx
  on public.incoming_document_allocation (sales_order_id) where sales_order_id is not null;

do $$
begin
  perform public.attach_standard_triggers('public.incoming_document_allocation'::regclass);
  execute 'alter table public.incoming_document_allocation enable row level security';
end $$;

create policy ida_read  on public.incoming_document_allocation for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
create policy ida_write on public.incoming_document_allocation for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
