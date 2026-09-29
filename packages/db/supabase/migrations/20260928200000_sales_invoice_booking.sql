-- ============================================================================
-- Buchungszeilen für Ausgangsrechnungen: Debitor an Erlöskonto(-e), analog zu
-- den Buchungszeilen auf der Bankseite (bank_transaction_match). Eine
-- Rechnung kann mehrere Zeilen haben (mehrere Steuersätze, z.B. Druckprodukt
-- 19% + Porto 0%). Wird aus net_total/tax_total/tax_breakdown + dem
-- bestehenden Setting datev.revenue_accounts abgeleitet (gleiche Logik wie
-- der DATEV-Export, jetzt aber persistiert statt nur zur Exportzeit
-- berechnet - für Anzeige auf der Rechnung und künftige manuelle Korrektur).
-- ============================================================================

create table public.sales_invoice_booking (
  id               uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.sales_invoice (id) on delete cascade,
  ledger_account   text not null,           -- Erlöskonto (Gegenkonto), Kontonummer als text
  tax_rate         numeric(6,3),
  net_amount       numeric(14,2) not null,
  tax_amount       numeric(14,2) not null,
  gross_amount     numeric(14,2) not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index sales_invoice_booking_invoice_idx on public.sales_invoice_booking (sales_invoice_id);

do $$
begin
  perform public.attach_standard_triggers('public.sales_invoice_booking'::regclass);
end $$;
alter table public.sales_invoice_booking enable row level security;

create policy sib_staff_read on public.sales_invoice_booking for select using (public.is_staff());
create policy sib_staff_write on public.sales_invoice_booking for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
