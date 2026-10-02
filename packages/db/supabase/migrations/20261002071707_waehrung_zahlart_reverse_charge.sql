-- §13b Reverse-Charge-Steuerschlüssel für ausländische B2B-Dienstleister
-- (SaaS-Anbieter wie WeWeb/Heroku/Supabase/PrintNode/Anthropic) - bisher gab
-- es dafür keinen eigenen Code, betroffene Belege liefen fälschlich unter
-- VST19 oder ganz ohne Steuerschlüssel. DATEV-BU-Schlüssel 94 = Standard-
-- Automatikschlüssel "Steuerschuldnerschaft des Leistungsempfängers" (SKR03).
insert into public.tax_code (code, name, rate, treatment, direction, datev_tax_key, is_system)
values ('VST13B', 'Vorsteuer §13b Reverse Charge (Ausland)', 19.0, 'reverse_charge_eu', 'input', '94', true)
on conflict (code) do nothing;

-- Fremdwährungs-Belege (USD/GBP/... Rechnungen ausländischer SaaS-Anbieter):
-- net_amount/tax_amount/gross_amount bleiben die tatsächlich zu buchenden
-- EUR-Beträge; fx_gross_amount hält zusätzlich den Original-Rechnungsbetrag
-- in der Fremdwährung (laut `currency`) für die Anzeige fest.
alter table public.incoming_document
  add column if not exists fx_gross_amount numeric(14,2);

-- Zahlart um Überweisung/Lastschrift als eigene, einzeln wählbare Werte
-- erweitern (bisher implizit über payment_method = null zusammengefasst).
-- Name der bestehenden Check-Constraint dynamisch ermitteln statt zu raten.
do $$
declare
  c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.incoming_document'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_method%';
  if c is not null then
    execute format('alter table public.incoming_document drop constraint %I', c);
  end if;
end $$;
alter table public.incoming_document
  add constraint incoming_document_payment_method_check
  check (payment_method in ('card', 'paypal', 'transfer', 'direct_debit'));

-- Vorkontierungs-Regel (posting_rule) um eine Zahlart-Vorgabe je Lieferant
-- erweitern (z.B. "WeWeb immer Kreditkarte") - wird bei der KI-Extraktion wie
-- Aufwandskonto/Steuerschlüssel als Vorschlag angewendet.
alter table public.posting_rule
  add column if not exists payment_method text
  check (payment_method in ('card', 'paypal', 'transfer', 'direct_debit'));
