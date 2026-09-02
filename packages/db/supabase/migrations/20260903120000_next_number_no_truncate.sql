-- ============================================================================
-- next_number(): lpad(text, len) schneidet rechts ab, wenn die Zahl länger als
-- `padding` ist ("100001" -> "10000"). padding ist aber eine Mindestbreite,
-- keine Maximalbreite. Fix: nur auffüllen, nie kürzen.
-- Relevant, sobald customer_number/supplier_number 99999 überschreiten.
-- ============================================================================

create or replace function public.next_number(p_key text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.number_sequence;
  v_period text;
  v_next   bigint;
begin
  select * into r from public.number_sequence where key = p_key for update;
  if not found then
    raise exception 'Unbekannter Nummernkreis: %', p_key;
  end if;

  v_period := case when r.period = 'year' then to_char(p_date, 'YYYY') else '' end;

  if r.period = 'year' and r.period_value is distinct from v_period then
    update public.number_sequence
       set current_value = 1, period_value = v_period, updated_at = now()
     where key = p_key
     returning current_value into v_next;
  else
    update public.number_sequence
       set current_value = current_value + 1, updated_at = now()
     where key = p_key
     returning current_value into v_next;
  end if;

  return r.prefix
      || case when r.period = 'year' then v_period || '-' else '' end
      || case
           when length(v_next::text) >= r.padding then v_next::text
           else lpad(v_next::text, r.padding, '0')
         end
      || r.suffix;
end;
$$;
