-- flux-Übergabe: Payload + Antwort am Batch festhalten (Debug / Nachvollziehbarkeit).
alter table public.druck_batch add column if not exists flux_payload  jsonb;
alter table public.druck_batch add column if not exists flux_response jsonb;
