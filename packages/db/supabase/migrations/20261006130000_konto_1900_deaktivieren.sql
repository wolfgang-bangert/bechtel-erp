-- 1900 "Privatentnahmen allgemein (Teilhafter)" war nur ein Behelf in BuchhaltungsButler (GmbH & Co. KG).
-- Privatentnahmen werden immer auf 1800 gebucht; 1900 wird nicht mehr zur Auswahl angeboten.
update public.ledger_account set is_active = false where number = '1900';
