-- ============================================================================
-- Eine Lohnbuchung (z.B. "Abzuführende SV-Beiträge" als eine Sammelzeile im
-- Buchungsstapel) entspricht auf dem Konto oft mehreren einzelnen Zahlungen
-- (je Krankenkasse eine eigene Überweisung) statt einer einzigen Bankzeile -
-- die bisherige 1:1-Regel (höchstens eine Bankzeile pro Lohnbuchung) war zu
-- eng. Mehrere bank_transaction_match-Zeilen dürfen jetzt dieselbe
-- payroll_booking_id tragen.
-- ============================================================================

drop index if exists public.btm_payroll_booking_uidx;
