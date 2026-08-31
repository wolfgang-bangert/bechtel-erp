/**
 * Straße + Hausnummer aus einem kombinierten String trennen (deutsche
 * Heuristik: Hausnummer = abschließende Ziffer(n) + optionaler Buchstabe,
 * optional als Bereich "12-14" / "12/3"). Kein Treffer → alles in `street`.
 */
export function splitStreet(input: string | null | undefined): {
  street: string | null;
  houseNumber: string | null;
} {
  const s = (input ?? "").trim();
  if (!s) return { street: null, houseNumber: null };
  const m = s.match(/^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)\s*$/);
  if (!m) return { street: s, houseNumber: null };
  return {
    street: m[1].trim().replace(/[,\s]+$/, "") || s,
    houseNumber: m[2].replace(/\s+/g, ""),
  };
}

/** Straße + Hausnummer + Zusatz zu einer Anzeigezeile zusammensetzen. */
export function joinStreet(
  street: string | null | undefined,
  houseNumber: string | null | undefined,
): string {
  return [street, houseNumber].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
}
