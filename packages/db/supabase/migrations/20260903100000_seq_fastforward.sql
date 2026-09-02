-- ============================================================================
-- Import (Keyline/Ninox) hat customer_number / supplier_number direkt gesetzt,
-- ohne die number_sequence hochzuzählen. next_number() kollidiert dadurch.
-- Sequenzen einmalig auf den tatsächlichen Höchststand nachziehen.
-- ============================================================================

update public.number_sequence ns
set current_value = greatest(
  ns.current_value,
  coalesce(
    (select max(customer_number::bigint)
       from public.organization
      where customer_number ~ '^[0-9]+$'),
    ns.current_value
  )
),
updated_at = now()
where ns.key = 'customer_number';

update public.number_sequence ns
set current_value = greatest(
  ns.current_value,
  coalesce(
    (select max(supplier_number::bigint)
       from public.organization
      where supplier_number ~ '^[0-9]+$'),
    ns.current_value
  )
),
updated_at = now()
where ns.key = 'supplier_number';
