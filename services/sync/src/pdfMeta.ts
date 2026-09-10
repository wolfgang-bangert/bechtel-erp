/**
 * PDF-Metadaten der Druckdaten per Byte-Parsing bestimmen (ohne Fremd-Tool):
 * Seitenzahl, häufigste MediaBox → Endformat + Ausrichtung, /Rotate beachtet.
 */
const PT2MM = 25.4 / 72;

export type PdfMeta = {
  ausrichtung: "Hochformat" | "Querformat" | null;
  breite_mm: number;
  hoehe_mm: number;
  seiten: number;
  formate: string[]; // alle vorkommenden "BxH" in pt (falls gemischt)
  rotate: number;
  at: string;
};

export function analysePdfMeta(buf: Buffer): PdfMeta {
  const s = buf.toString("latin1");
  const at = new Date().toISOString();

  const seiten = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  const rotM = /\/Rotate\s+(-?\d+)/.exec(s);
  const rotate = rotM ? (((Number(rotM[1]) % 360) + 360) % 360) : 0;

  const mbs = [
    ...s.matchAll(
      /\/MediaBox\s*\[\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*\]/g,
    ),
  ];
  const counts = new Map<string, { w: number; h: number; n: number }>();
  for (const m of mbs) {
    let w = Math.abs(Number(m[3]) - Number(m[1]));
    let h = Math.abs(Number(m[4]) - Number(m[2]));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) continue;
    if (rotate === 90 || rotate === 270) [w, h] = [h, w];
    const k = `${w.toFixed(0)}x${h.toFixed(0)}`;
    const e = counts.get(k) ?? { w, h, n: 0 };
    e.n++;
    counts.set(k, e);
  }

  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!top) {
    return { ausrichtung: null, breite_mm: 0, hoehe_mm: 0, seiten, formate: [], rotate, at };
  }
  const breite_mm = Math.round(top.w * PT2MM * 10) / 10;
  const hoehe_mm = Math.round(top.h * PT2MM * 10) / 10;
  const ausrichtung =
    Math.abs(breite_mm - hoehe_mm) < 1
      ? null
      : breite_mm > hoehe_mm
        ? "Querformat"
        : "Hochformat";

  return { ausrichtung, breite_mm, hoehe_mm, seiten, formate: [...counts.keys()], rotate, at };
}
