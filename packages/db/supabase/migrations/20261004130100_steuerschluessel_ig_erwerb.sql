-- Vorsteuer-Schlüssel "Innergemeinschaftlicher Erwerb 19 %": DATEV-Buchungsschlüssel 19
-- (Standard SKR03: ig. Erwerb 19 % Vorsteuer und 19 % Umsatzsteuer); Voranmeldung Kz 89 / Vorsteuer Kz 61.
insert into public.tax_code (code, name, rate, treatment, direction, datev_tax_key, is_system)
values ('VST_IGE19', 'Innergemeinschaftlicher Erwerb 19 % (steuerfreie Lieferung, Art. 138 MwStSystRL)', 19.0,
        'intra_community_acquisition', 'input', '19', true)
on conflict (code) do nothing;
