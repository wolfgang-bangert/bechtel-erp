/**
 * Kartonvorschlag — bewusst nur ein VORSCHLAG.
 * Lose Zuordnung: eine Regel greift, wenn ihr produkt_tag (case-insensitiv) in
 * der Positionsbezeichnung vorkommt und die Menge in [stueck_von, stueck_bis]
 * liegt. Regeln ohne Tag matchen nicht automatisch (kein Universal-Karton).
 * Kein Treffer → Hinweis, kein Fehler; alles bleibt manuell überschreibbar.
 */

export type PackRegel = {
  produkt_tag: string | null;
  stueck_von: number;
  stueck_bis: number;
  prio: number;
  spedition_erlaubt: boolean;
  packmittel_id: string | null;
  packmittel?: {
    bezeichnung: string;
    leergewicht_kg: number | string | null;
    laenge_mm: number | null;
    breite_mm: number | null;
    hoehe_mm: number | null;
  } | null;
};

export type PackPos = { description: string; quantity: number | null; weight_kg: number | null };

export type PackVorschlag = {
  anzahl: number; // Anzahl gleicher Kartons
  packmittel_id: string | null;
  packmittel_bezeichnung: string | null;
  stueck_je_karton: number;
  gewicht_kg: number; // je Karton
  laenge_cm: number | null;
  breite_cm: number | null;
  hoehe_cm: number | null;
  basis: string;
};

const N = (v: unknown) => Number(v ?? 0);

export function packe(
  positionen: PackPos[],
  regeln: PackRegel[],
): { vorschlag: PackVorschlag[]; hinweise: string[]; speditionErlaubt: boolean } {
  const hinweise: string[] = [];
  const vorschlag: PackVorschlag[] = [];
  let speditionErlaubt = true;

  for (const pos of positionen) {
    const menge = Math.max(1, Math.round(Number(pos.quantity) || 1));
    const desc = (pos.description || "").toLowerCase();
    const stueckGewicht = pos.weight_kg ? N(pos.weight_kg) / menge : 0;

    const passend = regeln
      .filter((r) => r.produkt_tag && desc.includes(r.produkt_tag.toLowerCase()))
      .sort((a, b) => a.prio - b.prio || a.stueck_bis - b.stueck_bis);

    if (!passend.length) {
      hinweise.push(`„${pos.description}" (${menge} Stk): keine Regel — bitte manuell packen`);
      continue;
    }

    let regel = passend.find((r) => menge >= r.stueck_von && menge <= r.stueck_bis);
    let anzahl = 1;
    let stueckJe = menge;
    let geschaetzt = false;
    if (!regel) {
      regel = passend.reduce((a, b) => (b.stueck_bis > a.stueck_bis ? b : a));
      anzahl = Math.max(1, Math.ceil(menge / regel.stueck_bis));
      stueckJe = Math.ceil(menge / anzahl);
      geschaetzt = true;
    }
    if (!regel.spedition_erlaubt) speditionErlaubt = false;

    const pm = regel.packmittel ?? null;
    const tara = pm?.leergewicht_kg ? N(pm.leergewicht_kg) : 0;
    vorschlag.push({
      anzahl,
      packmittel_id: regel.packmittel_id,
      packmittel_bezeichnung: pm?.bezeichnung ?? null,
      stueck_je_karton: stueckJe,
      gewicht_kg: Math.round((stueckJe * stueckGewicht + tara) * 1000) / 1000,
      laenge_cm: pm?.laenge_mm != null ? pm.laenge_mm / 10 : null,
      breite_cm: pm?.breite_mm != null ? pm.breite_mm / 10 : null,
      hoehe_cm: pm?.hoehe_mm != null ? pm.hoehe_mm / 10 : null,
      basis:
        `${pos.description}: ${menge} Stk` +
        (geschaetzt
          ? ` → ${anzahl}× ${pm?.bezeichnung ?? "Karton"} à ~${stueckJe} (geschätzt)`
          : ` → ${pm?.bezeichnung ?? "Karton"}`) +
        (stueckGewicht ? "" : " · Stückgewicht unbekannt (nur Tara)"),
    });
  }

  return { vorschlag, hinweise, speditionErlaubt };
}
