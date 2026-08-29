-- ============================================================================
-- Ablage-Verweis auf das Rechnungs-PDF (Hetzner Object Storage).
-- pdf_status: unknown = noch nicht versucht · available · none (Quelle hat keins)
--             · error
-- ============================================================================

alter table public.sales_invoice
  add column if not exists pdf_storage_key text,
  add column if not exists pdf_status text not null default 'unknown'
    check (pdf_status in ('unknown', 'available', 'none', 'error')),
  add column if not exists pdf_synced_at timestamptz;
