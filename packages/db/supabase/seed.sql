-- ============================================================================
-- seed.sql — nur für lokale Entwicklung (läuft bei `supabase db reset`).
-- KEINE Referenzdaten hier (die stehen in der Foundation-Migration).
-- Nur Demo-Datensätze zum Ausprobieren.
-- ============================================================================

-- Demo-Zahlungsbedingungen
insert into public.payment_terms (name, net_days, discount_percent, discount_days) values
  ('14 Tage netto', 14, 0, 0),
  ('30 Tage / 2 % Skonto 10 Tage', 30, 2.0, 10)
on conflict do nothing;

-- Demo-Kostenstellen
insert into public.cost_center (number, name) values
  ('100', 'Vorstufe'),
  ('200', 'Digitaldruck'),
  ('300', 'Weiterverarbeitung / Wire-O'),
  ('900', 'Verwaltung')
on conflict (number) do nothing;

-- Demo-Kunde
insert into public.organization (id, relation, customer_segment, name, tax_country, customer_number)
values ('11111111-1111-1111-1111-111111111111', 'customer', 'akzidenz', 'Muster Verlag GmbH', 'DE',
        public.next_number('customer_number'))
on conflict (id) do nothing;

insert into public.organization_external_ref (organization_id, system, external_id, is_authoritative)
values ('11111111-1111-1111-1111-111111111111', 'keyline', 'demo-keyline-1', true)
on conflict (system, external_id) do nothing;

insert into public.address (organization_id, kind, is_default, line1, zip, city, country)
values ('11111111-1111-1111-1111-111111111111', 'billing', true, 'Beispielstraße 1', '10115', 'Berlin', 'DE')
on conflict do nothing;

insert into public.contact (organization_id, first_name, last_name, email, is_primary)
values ('11111111-1111-1111-1111-111111111111', 'Erika', 'Musterfrau', 'erika@muster-verlag.example', true)
on conflict do nothing;

-- Demo-Lieferant
insert into public.organization (relation, name, tax_country, supplier_number)
values ('supplier', 'Papier Nord OHG', 'DE', public.next_number('supplier_number'))
on conflict do nothing;

-- Demo-Arbeitszeitmodell + Mitarbeiter
insert into public.working_time_model (id, name)
values ('22222222-2222-2222-2222-222222222222', 'Vollzeit 5 Tage')
on conflict (id) do nothing;

insert into public.employee (personnel_number, first_name, last_name, weekly_hours, working_time_model_id)
values ('0001', 'Max', 'Beispiel', 40, '22222222-2222-2222-2222-222222222222')
on conflict (personnel_number) do nothing;
