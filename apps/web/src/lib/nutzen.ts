/** Wie viele Endformate passen auf einen Druckbogen (Geometrie, beide Ausrichtungen). */
export type Rect = { breite_mm: number | null; hoehe_mm: number | null };

export function berechneNutzen(
  format: Rect,
  bogen: { breite_mm: number; hoehe_mm: number; greifer_mm?: number | null },
  randzugabe_mm = 4,
): { nutzen: number; anordnung: string; gedreht: boolean } {
  const fb = Number(format.breite_mm) || 0;
  const fh = Number(format.hoehe_mm) || 0;
  const bb = Number(bogen.breite_mm) || 0;
  const bh = (Number(bogen.hoehe_mm) || 0) - (Number(bogen.greifer_mm) || 0);
  if (fb <= 0 || fh <= 0 || bb <= 0 || bh <= 0) {
    return { nutzen: 0, anordnung: "", gedreht: false };
  }
  const r = Math.max(0, randzugabe_mm);
  const fit = (w: number, h: number) => {
    const cols = Math.floor((bb + r) / (w + r));
    const rows = Math.floor((bh + r) / (h + r));
    return { n: Math.max(0, cols) * Math.max(0, rows), cols, rows };
  };
  const a = fit(fb, fh); // gerade
  const b = fit(fh, fb); // 90° gedreht
  if (b.n > a.n) return { nutzen: b.n, anordnung: `${b.cols}×${b.rows}`, gedreht: true };
  return { nutzen: a.n, anordnung: `${a.cols}×${a.rows}`, gedreht: false };
}
