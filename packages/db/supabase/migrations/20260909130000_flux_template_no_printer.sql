-- ============================================================================
-- flux_template.printer_name entfällt: Das Template beschreibt nur das Produkt +
-- Overrides. Welcher Drucker die Tätigkeit ausführt, wird erst beim Batch
-- (Belegungs-Board / „an flux übergeben") aus der zugeordneten Maschine gewählt.
-- ============================================================================

alter table public.flux_template drop column if exists printer_name;
