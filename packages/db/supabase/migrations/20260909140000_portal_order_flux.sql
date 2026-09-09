-- ============================================================================
-- Direkte flux-Übergabe eines Auftrags nachvollziehbar machen: letztes
-- Payload + Antwort + orderId am portal_order festhalten.
-- ============================================================================

alter table public.portal_order
  add column if not exists flux_order_id text,
  add column if not exists flux_sent_at  timestamptz,
  add column if not exists flux_payload  jsonb,
  add column if not exists flux_response jsonb;
