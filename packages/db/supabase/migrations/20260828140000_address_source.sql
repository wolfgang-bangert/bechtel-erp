-- ============================================================================
-- address: Herkunft mitführen, damit der Sync idempotent aktualisieren kann.
-- external_id z. B. 'keyline:212166'. NULL bei in werk erfassten Adressen
-- (mehrere NULL sind im UNIQUE erlaubt).
-- ============================================================================

alter table public.address
  add column if not exists source text not null default 'werk'
    check (source in ('werk', 'keyline', 'ninox')),
  add column if not exists external_id text;

alter table public.address
  add constraint address_external_id_key unique (external_id);

create index if not exists address_source_idx on public.address (source);
