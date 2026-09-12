-- ============================================================================
-- Standbogen um Druckbogen + Nutzen erweitern.
--
-- Der Standbogen ist das komplette Ausschießen (Bogenformat, Seitengröße,
-- Anordnung, Marken, Reihenfolge – inkl. der 90°-Drehung: je angelieferter
-- PDF-Ausrichtung eine eigene Standbogen-Zeile). Damit kennt er auch den
-- Nutzen (Anordnung „2×1" → 2) und den Druckbogen. werk braucht beide für die
-- eigene Bogen-/Planungsrechnung (netto_bogen), an flux geht nur die Signature.
--
--   standbogen.ausrichtung  = angelieferte PDF-Ausrichtung (pdf_meta.ausrichtung)
-- ============================================================================

alter table public.standbogen
  add column if not exists druckbogen text,   -- z. B. SRA3 – werk-Batch-Schlüssel + Rüstzustand
  add column if not exists nutzen     integer; -- Stück pro Bogen; null → Fallback vernutzung
