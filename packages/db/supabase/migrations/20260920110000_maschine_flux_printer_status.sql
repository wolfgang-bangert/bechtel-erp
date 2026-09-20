-- Live-Druckerstatus aus dem flux-Webhook "Drucker: Status geändert" -
-- mirrort das bestehende portal_order.flux_status/flux_status_at-Muster.
alter table public.maschine
  add column if not exists flux_printer_status    text,
  add column if not exists flux_printer_status_at timestamptz;
