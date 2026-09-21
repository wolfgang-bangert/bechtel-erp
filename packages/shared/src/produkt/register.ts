/**
 * Register-Berechnung für mehrteilige Register (z.B. 10-teilig auf A4).
 * Jeder Reiter hat eine Position 1..teile; bei mehr Reitern als Positionen
 * beginnt die Zählung von vorn (Position 11 = wieder Position 1). Die
 * Registergröße ist die Schnittposition: Position × Seitenhöhe / Teile
 * (10-teilig auf A4 = 29,7 mm je Position).
 */

/** Position im Register für die laufende Nummer (1-basiert) mit Umlauf. */
export function registerPosition(lfdNr: number, teile = 10): number {
  return ((lfdNr - 1) % teile) + 1;
}

/** Registergröße in mm (auf 0,1 mm gerundet). */
export function registerMm(position: number, hoeheMm = 297, teile = 10): number {
  return Math.round(((position * hoeheMm) / teile) * 10) / 10;
}
