-- Onlineprinters-Sammelrechnung: Rechnungs-E-Mail an der Organisation, Verknüpfung zur
-- Ausgangsrechnung (Buchhaltung) und Mailversand-Status; Bankverbindung auf Rechnungen = Oberbank.
alter table public.organization
  add column if not exists invoice_email text;

alter table public.invoice
  add column if not exists sales_invoice_id uuid references public.sales_invoice (id) on delete set null,
  add column if not exists mail_status text check (mail_status in ('vorgemerkt', 'gesendet', 'fehler')),
  add column if not exists mail_to text,
  add column if not exists mail_sent_at timestamptz,
  add column if not exists mail_error text;

-- Im Firmenprofil waren IBAN und Name vertauscht (Kreissparkasse). Rechnungen sollen nur das Oberbank-Konto nennen.
update public.setting
   set value = jsonb_set(value, '{bank}', '{"name":"Oberbank AG","iban":"DE30 7012 0700 1801 1106 67"}'::jsonb)
 where key = 'company.profile';
