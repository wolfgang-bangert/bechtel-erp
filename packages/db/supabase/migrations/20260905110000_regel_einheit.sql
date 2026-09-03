-- Materialregeln: Ausgabeeinheit + Vernutzung.
alter table public.opri_material_regel
  add column einheit text not null default 'stück'
    check (einheit in ('stück', 'bogen', 'blatt', 'm²')),
  add column vernutzung_format text;   -- Format-Code für Nutzen; leer = Produktformat
