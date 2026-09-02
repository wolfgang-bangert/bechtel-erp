-- ============================================================================
-- Versand Phase 2 (Teil 2): Absender, Gewicht aus Positionen, Benachrichtigung,
-- Zollangaben (Proforma). Ergänzt bestehende shipment-Tabellen.
-- Ablauf: 1 Empfänger · 2 Absender · 3 Inhalt+Gewicht · 4 Preisvergleich ·
--         5 Carrierwahl · 6 Packstücke+Tracking · 7 Druck · 8 Benachrichtigung
-- ============================================================================

alter table public.shipment
  add column sender_mode text not null default 'bechtel'
    check (sender_mode in ('bechtel', 'kunde', 'frei')),
  add column sender_name text,
  add column sender_addition text,
  add column sender_street text,
  add column sender_house_number text,
  add column sender_address_addition text,
  add column sender_zip text,
  add column sender_city text,
  add column sender_country text default 'DE',
  add column neutral_versand boolean not null default false,   -- white label: kein Absenderaufdruck
  add column total_weight_kg numeric(10,3),                    -- effektives Gesamtgewicht
  add column weight_mode text not null default 'positionen'
    check (weight_mode in ('positionen', 'manuell')),
  add column notify_recipient boolean not null default false,
  add column notify_email text,
  add column keyline_shipment_ref text;

alter table public.shipment_item
  add column weight_kg numeric(10,3),
  add column customs_value numeric(12,2),
  add column customs_tariff_no text,
  add column origin_country text;
