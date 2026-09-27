-- ============================================================================
-- Batch-Erzeugung ("Jobs erzeugen") schlug fehl: duplicate key value violates
-- unique constraint "druck_batch_nummer_key" - die number_sequence für
-- "batch" ist hinter den tatsächlich vergebenen batch.nummer zurückgefallen
-- (irgendwo wurde ein Batch angelegt, ohne next_number() zu erhöhen), gleiche
-- Ursache wie bei 20260903100000_seq_fastforward.sql (dort für
-- customer_number/supplier_number). Einmalig auf den echten Höchststand
-- nachziehen.
-- ============================================================================

update public.number_sequence ns
set current_value = greatest(
  ns.current_value,
  coalesce(
    (select max(substring(b.nummer from '[0-9]+$')::bigint)
       from public.batch b
      where b.nummer like ns.prefix || ns.period_value || '-%'),
    ns.current_value
  )
),
updated_at = now()
where ns.key = 'batch';
