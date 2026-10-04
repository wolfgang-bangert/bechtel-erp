-- Vorsteuer-Schlüssel "keine Vorsteuer / steuerfrei (0 %)": Rechnungen deutscher Lieferanten ohne USt,
-- z.B. Porto der Deutschen Post (§ 4 Nr. 11b UStG), Versicherungen, Banken, Mieten ohne Option.
-- Kein DATEV-Buchungsschlüssel (Buchung ohne Steuerschlüssel); die Voranmeldung zieht keine Vorsteuer.
-- Der Schlüssel macht die Entscheidung "bewusst 0 %" sichtbar statt "Schlüssel fehlt".
insert into public.tax_code (code, name, rate, treatment, direction, datev_tax_key, is_system)
values ('VST0', 'Keine Vorsteuer / steuerfrei (0 %) - z.B. Porto, Versicherung', 0.0, 'tax_free_other', 'input', null, true)
on conflict (code) do nothing;
