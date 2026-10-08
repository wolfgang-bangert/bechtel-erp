/** Abweichung zwischen abgerechnetem Betrag und Listenpreis einer Abrechnungsposition (auf Cent gerundet). */
export function abweichung(p: { preis_netto: number | null; betrag_netto: number }): number {
  return Math.round((Number(p.betrag_netto) - Number(p.preis_netto ?? 0)) * 100) / 100;
}
