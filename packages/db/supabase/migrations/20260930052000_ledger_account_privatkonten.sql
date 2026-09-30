-- Konto 1800 (Privatentnahmen allgemein) fehlte, weil ledger_account per
-- bb:import-accounts aus BuchhaltungsButler befuellt wird (nur dort gebuchte
-- Konten, kein vollstaendiger SKR03) - buba hatte fuer Privatentnahmen nur
-- das verwandte Konto 1900 (Teilhafter-Variante) im Bestand. Ergaenzt die
-- komplette SKR03-Privatkonten-Familie 1800-1891 additiv, damit auch die
-- Geschwisterkonten (Privatsteuern, Spenden, Privateinlagen, ...) beim
-- manuellen Verbuchen zur Verfuegung stehen.
insert into public.ledger_account (number, name, kind, is_system, is_active)
values
  ('1800', 'Privatentnahmen allgemein', 'liability', false, true),
  ('1801', 'Privatentnahmen allgemein (nur Einzelunternehmen)', 'liability', false, true),
  ('1810', 'Privatsteuern', 'liability', false, true),
  ('1811', 'Privatsteuern (nur Einzelunternehmen)', 'liability', false, true),
  ('1820', 'Sonderausgaben beschränkt abzugsfähig', 'liability', false, true),
  ('1821', 'Sonderausgaben beschränkt abzugsfähig (nur Einzelunternehmen)', 'liability', false, true),
  ('1830', 'Sonderausgaben unbeschränkt abzugsfähig', 'liability', false, true),
  ('1831', 'Sonderausgaben unbeschränkt abzugsfähig (nur Einzelunternehmen)', 'liability', false, true),
  ('1840', 'Zuwendungen, Spenden', 'liability', false, true),
  ('1841', 'Zuwendungen, Spenden (nur Einzelunternehmen)', 'liability', false, true),
  ('1850', 'Außergewöhnliche Belastungen', 'liability', false, true),
  ('1851', 'Außergewöhnliche Belastungen (nur Einzelunternehmen)', 'liability', false, true),
  ('1860', 'Grundstücksaufwand', 'liability', false, true),
  ('1861', 'Grundstücksaufwand (nur Einzelunternehmen)', 'liability', false, true),
  ('1869', 'Grundstücksaufwand (Umsatzsteuerschlüssel möglich)', 'liability', false, true),
  ('1870', 'Grundstücksertrag', 'liability', false, true),
  ('1871', 'Grundstücksertrag (nur Einzelunternehmen)', 'liability', false, true),
  ('1879', 'Grundstücksertrag (Umsatzsteuerschlüssel möglich)', 'liability', false, true),
  ('1880', 'Unentgeltliche Wertabgaben', 'liability', false, true),
  ('1881', 'Unentgeltliche Wertabgaben (nur Einzelunternehmen)', 'liability', false, true),
  ('1890', 'Privateinlagen', 'liability', false, true),
  ('1891', 'Privateinlagen (nur Einzelunternehmen)', 'liability', false, true)
on conflict (number) do nothing;
