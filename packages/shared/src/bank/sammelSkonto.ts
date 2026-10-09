/**
 * Sammelzahlung mit Skonto anteilig verteilen.
 *
 * Eine Bankzeile bezahlt mehrere Eingangsrechnungen; der Lieferant hat auf
 * alle denselben Skontosatz gezogen. Würden die Rechnungen nacheinander voll
 * aufgefüllt, bliebe der gesamte Skonto als „offen“ an der letzten Rechnung
 * hängen (partly_paid) und skonto:apply erkennt ihn dort nicht (Grenze 3 %
 * je Beleg). Hier wird stattdessen je Rechnung offen × (1 − Satz) verteilt;
 * die verbleibende Differenz je Rechnung bucht skonto:apply als Skonto aus.
 *
 * Beispiel OVOL 18.02.2026: 402,11 + 1.156,35 + 734,34 = 2.292,80, gezahlt
 * 2.224,02 → 3 % → 390,05 / 1.121,66 / 712,31 (Skonto 12,06 / 34,69 / 22,03).
 */

export type SammelBeleg = {
  id: string;
  /** noch offener Betrag (positiv) */
  offen: number;
  discount_percent?: number | null;
  discount_amount?: number | null;
};

export type SammelAnteil = { id: string; betrag: number; skonto: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** übliche Skontosätze; höhere nur, wenn eine Rechnung ihn selbst ausweist */
const STANDARD_SAETZE = [1, 1.5, 2, 2.5, 3];

/**
 * Liefert die anteilige Verteilung, wenn die Differenz (Summe offen −
 * Zahlbetrag) einem einheitlichen Skontosatz bzw. den hinterlegten
 * Skontobeträgen entspricht (±0,01 € Rundung je Beleg). Sonst null – dann
 * gilt das bisherige Verhalten des Aufrufers.
 */
export function verteileSammelzahlungMitSkonto(
  zahlbetrag: number,
  belege: SammelBeleg[],
): SammelAnteil[] | null {
  const paid = r2(Math.abs(zahlbetrag));
  const docs = belege.filter((b) => b.offen > 0.005);
  if (docs.length < 2 || docs.length !== belege.length) return null;
  const summe = r2(docs.reduce((s, b) => s + b.offen, 0));
  const diff = r2(summe - paid);
  const toleranz = 0.01 * docs.length + 0.005;
  if (diff <= toleranz) return null; // kein Skonto (oder Überzahlung)

  const verteile = (skontoJe: (b: SammelBeleg) => number): SammelAnteil[] | null => {
    const anteile = docs.map((b) => {
      const skonto = r2(skontoJe(b));
      return { id: b.id, betrag: r2(b.offen - skonto), skonto };
    });
    const rest = r2(paid - anteile.reduce((s, a) => s + a.betrag, 0));
    if (Math.abs(rest) > toleranz) return null;
    if (Math.abs(rest) > 0.005) {
      // Rundungscent auf die größte Rechnung
      const groesste = anteile.reduce((g, a, i) => (docs[i].offen > docs[g].offen ? i : g), 0);
      anteile[groesste].betrag = r2(anteile[groesste].betrag + rest);
      anteile[groesste].skonto = r2(anteile[groesste].skonto - rest);
    }
    if (anteile.some((a) => a.betrag <= 0 || a.skonto < 0)) return null;
    return anteile;
  };

  // 1. hinterlegte Skontobeträge, wenn alle Rechnungen einen haben
  if (docs.every((b) => (b.discount_amount ?? 0) > 0)) {
    const hit = verteile((b) => b.discount_amount ?? 0);
    if (hit) return hit;
  }
  // 2. einheitlicher Satz: zuerst die auf den Rechnungen hinterlegten, dann Standardsätze
  const saetze = [
    ...new Set([
      ...docs.map((b) => b.discount_percent ?? 0).filter((p) => p > 0 && p <= 10),
      ...STANDARD_SAETZE,
    ]),
  ];
  for (const satz of saetze) {
    const hit = verteile((b) => (b.offen * satz) / 100);
    if (hit) return hit;
  }
  return null;
}
