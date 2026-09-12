-- ============================================================================
-- Maße von "A3 halb" / "A4 halb" waren beim Seed (20260905100000) nur geraten
-- ("bitte prüfen/ergänzen") und falsch. Aus echten Aufträgen vermessen:
--
--   A3 halb: PDF-Endformat 420 x 148 mm (Auftrag 666494324, "A3 half")
--   A4 halb: PDF-Endformat 297 x 105 mm (Aufträge 666276988/666343654, "A4 half")
--
-- Muster: die kurze DIN-Seite wird halbiert, die lange bleibt (A3 420x297 ->
-- 420x148; A4 297x210 -> 297x105). breite_mm bleibt wie bei den übrigen
-- DIN-Zeilen die kurze Seite (Hochformat-Konvention).
-- ============================================================================

update public.format set breite_mm = 148, hoehe_mm = 420 where code = 'A3_halb';
update public.format set breite_mm = 105, hoehe_mm = 297 where code = 'A4_halb';
