-- external_sync_state.system um weitere Quellen erweitern (storage, bank, imap, datev)
alter table public.external_sync_state drop constraint if exists external_sync_state_system_check;
alter table public.external_sync_state
  add constraint external_sync_state_system_check
  check (system in ('keyline', 'ninox', 'xano', 'storage', 'bank', 'imap', 'datev'));
