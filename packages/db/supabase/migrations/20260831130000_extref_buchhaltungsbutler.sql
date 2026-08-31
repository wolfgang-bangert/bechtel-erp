-- ============================================================================
-- organization_external_ref: BuchhaltungsButler als Quellsystem zulassen
-- (für aus BB angelegte Lieferanten / Debitoren-Herkunft).
-- ============================================================================

alter table public.organization_external_ref
  drop constraint if exists organization_external_ref_system_check;
alter table public.organization_external_ref
  add constraint organization_external_ref_system_check
  check (system in ('keyline', 'ninox', 'xano', 'werk', 'buchhaltungsbutler'));
