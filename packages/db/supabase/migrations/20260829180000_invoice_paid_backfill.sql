-- Rechnungen, die im Quellsystem bereits als bezahlt markiert sind
-- (Keyline paid_at), auf payment_status='paid' setzen — damit die OP-Liste
-- nur die tatsächlich offenen Posten zeigt. Bank-Abgleich verfeinert später.

update public.sales_invoice
set payment_status = 'paid',
    paid_total = coalesce(gross_total, 0)
where paid_at is not null
  and payment_status = 'open'
  and kind = 'invoice';
