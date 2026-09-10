/**
 * PDF-Metadaten der Druckdaten per Byte-Parsing bestimmen (ohne Fremd-Tool):
 * Seitenzahl, häufigste MediaBox (Endformat + Beschnitt) und – wenn vorhanden –
 * häufigste TrimBox (= Endformat). /Rotate wird beachtet.
 */
const PT2MM = 25.4 / 72;

export type PdfMeta = {
  ausrichtung: "Hochformat" | "Querformat" | null;
  breite_mm: number; // MediaBox = Endformat + Beschnitt
  hoehe_mm: number;
  endformat_breite_mm: number | null; // TrimBox (falls im PDF gesetzt)
  endformat_hoehe_mm: number | null;
  beschnitt_mm: number | null; // (MediaBox − TrimBox) / 2, gerundet
  seiten: number;
  formate: string[]; // alle vorkommenden MediaBox-"BxH" in pt (falls gemischt)
  rotate: number;
  at: string;
};

/** häufigste WxH (in pt, /Rotate berücksichtigt) einer Box-Sorte im PDF-Bytestrom. */
function haeufigsteBox(s: string, box: "MediaBox" | "TrimBox", rotate: number) {
  const re = new RegExp(
    `\\/${box}\\s*\\[\\s*([\\d.eE+-]+)\\s+([\\d.eE+-]+)\\s+([\\d.eE+-]+)\\s+([\\d.eE+-]+)\\s*\\]`,
    "g",
  );
  const counts = new Map<string, { w: number; h: number; n: number }>();
  for (const m of s.matchAll(re)) {
    let w = Math.abs(Number(m[3]) - Number(m[1]));
    let h = Math.abs(Number(m[4]) - Number(m[2]));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) continue;
    if (rotate === 90 || rotate === 270) [w, h] = [h, w];
    const k = `${w.toFixed(0)}x${h.toFixed(0)}`;
    const e = counts.get(k) ?? { w, h, n: 0 };
    e.n++;
    counts.set(k, e);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0] ?? null;
  return { top, keys: [...counts.keys()] };
}

const mm = (pt: number) => Math.round(pt * PT2MM * 10) / 10;

export function analysePdfMeta(buf: Buffer): PdfMeta {
  const s = buf.toString("latin1");
  const at = new Date().toISOString();

  const seiten = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  const rotM = /\/Rotate\s+(-?\d+)/.exec(s);
  const rotate = rotM ? (((Number(rotM[1]) % 360) + 360) % 360) : 0;

  const media = haeufigsteBox(s, "MediaBox", rotate);
  const trim = haeufigsteBox(s, "TrimBox", rotate);

  if (!media.top) {
    return {
      ausrichtung: null,
      breite_mm: 0,
      hoehe_mm: 0,
      endformat_breite_mm: null,
      endformat_hoehe_mm: null,
      beschnitt_mm: null,
      seiten,
      formate: [],
      rotate,
      at,
    };
  }

  const breite_mm = mm(media.top.w);
  const hoehe_mm = mm(media.top.h);
  const endformat_breite_mm = trim.top ? mm(trim.top.w) : null;
  const endformat_hoehe_mm = trim.top ? mm(trim.top.h) : null;

  // Beschnitt = halber Überstand der MediaBox über die TrimBox (Mittel beider Achsen)
  const beschnitt_mm =
    endformat_breite_mm != null && endformat_hoehe_mm != null
      ? Math.round(
          (((breite_mm - endformat_breite_mm) + (hoehe_mm - endformat_hoehe_mm)) / 4) * 10,
        ) / 10
      : null;

  // Ausrichtung aus dem Endformat (TrimBox), sonst aus der MediaBox
  const ab = endformat_breite_mm ?? breite_mm;
  const ah = endformat_hoehe_mm ?? hoehe_mm;
  const ausrichtung =
    Math.abs(ab - ah) < 1 ? null : ab > ah ? "Querformat" : "Hochformat";

  return {
    ausrichtung,
    breite_mm,
    hoehe_mm,
    endformat_breite_mm,
    endformat_hoehe_mm,
    beschnitt_mm,
    seiten,
    formate: media.keys,
    rotate,
    at,
  };
}
