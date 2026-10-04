-- Ausgangsrechnungen, die nur in BuchhaltungsButler existieren (z.B. Festool-Konsignationsabrechnungen,
-- von Hand erstellte Rechnungen): Quelle 'bb' erlauben.
do $$
declare c record;
begin
  for c in
    select con.conrelid::regclass as tbl, con.conname
      from pg_constraint con
     where con.contype = 'c'
       and con.conrelid in ('public.sales_invoice'::regclass, 'public.sales_invoice_item'::regclass)
       and pg_get_constraintdef(con.oid) like '%source%keyline%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.sales_invoice
  add constraint sales_invoice_source_check check (source in ('keyline', 'ninox', 'werk', 'bb'));
alter table public.sales_invoice_item
  add constraint sales_invoice_item_source_check check (source in ('keyline', 'ninox', 'werk', 'bb'));
