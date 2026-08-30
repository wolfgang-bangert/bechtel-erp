-- Ninox-Rechnungen haben im Spiegel keine brauchbare Nummer ("Archiv ID"
-- enthielt Fehlertexte). Ninox-Nummernschema laut Bankverwendungszweck:
-- <JJ>CE<Ninox-Record-ID>  (CE = Ninox-Tabelle "Rechnungen"). Ableiten.
update public.sales_invoice
set invoice_number = to_char(invoice_date, 'YY') || 'CE' || split_part(external_id, ':', 3)
where source = 'ninox'
  and invoice_date is not null
  and external_id like 'ninox:CE:%'
  and (invoice_number is null or invoice_number !~ '^\d{2}CE\d+$');
