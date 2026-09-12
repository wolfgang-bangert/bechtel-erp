-- ============================================================================
-- Umschlag/Inhalt aus einer 2-seitigen Druckdaten-PDF trennen (z. B. PBS
-- "4-farbig": Kunde liefert Umschlag + Inhalt in einer Datei). Meistens ist
-- Seite 1 = Umschlag, Seite 2 = Inhalt - aber nicht zuverlässig automatisch
-- erkennbar (~10 % andersrum). Manueller Tausch-Schalter je Auftrag.
-- ============================================================================

alter table public.portal_order
  add column if not exists pdf_seiten_tausch boolean not null default false;
