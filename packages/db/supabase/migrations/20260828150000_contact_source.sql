-- ============================================================================
-- contact: Herkunft mitführen (analog zu address), für idempotenten Sync.
-- external_id z. B. 'ninox:people:1234' oder 'keyline:contact:100001'.
-- ============================================================================

alter table public.contact
  add column if not exists source text not null default 'werk'
    check (source in ('werk', 'keyline', 'ninox')),
  add column if not exists external_id text;

alter table public.contact
  add constraint contact_external_id_key unique (external_id);

create index if not exists contact_source_idx on public.contact (source);
