-- ============================================================================
-- Adresse: Straße und Hausnummer getrennt führen (werk-Grundsatz).
-- Keyline liefert die Hausnummer als eigenes Feld, Ninox nicht — dort wird
-- sie aus dem Straßen-String geparst. line1/line2 bleiben als Anzeige-/Altfeld.
-- ============================================================================

alter table public.address
  add column if not exists street           text,
  add column if not exists house_number     text,
  add column if not exists address_addition text;

comment on column public.address.street is
  'Straße ohne Hausnummer. Für werk maßgeblich; line1 bleibt Anzeige-/Altfeld.';
comment on column public.address.house_number is
  'Hausnummer separat (Keyline-Feld; bei Ninox/Altbestand aus line1 geparst).';
comment on column public.address.address_addition is
  'Adresszusatz (c/o, Gebäude, Stockwerk) — entspricht Keyline "addition".';

-- Backfill bestehender Zeilen: line1 in Straße + Hausnummer zerlegen.
-- Heuristik: Hausnummer = abschließende Ziffer(n) + optionaler Buchstabe,
-- optional als Bereich ("12-14", "12/3"). Ohne Treffer bleibt house_number NULL
-- und street = line1.
update public.address
set
  street = coalesce(
    street,
    nullif(btrim(regexp_replace(line1,
      '\s+\d+\s*[a-zA-Z]?(\s*[-/]\s*\d+\s*[a-zA-Z]?)?\s*$', '')), '')
  ),
  house_number = coalesce(
    house_number,
    nullif(regexp_replace(line1,
      '^.*?(\d+\s*[a-zA-Z]?(\s*[-/]\s*\d+\s*[a-zA-Z]?)?)\s*$', '\1'), line1)
  ),
  address_addition = coalesce(address_addition, line2)
where line1 is not null;
