/**
 * Bildverarbeitung fürs Scannen im Browser: Foto verkleinern, drehen, "Dokument"-Filter
 * (Papier weiß, Schrift kräftig) und alle Seiten zu einem PDF zusammensetzen (pdf-lib).
 */

export type Filter = "farbe" | "grau" | "dokument";
export type Seite = {
  id: string;
  /** auf max. MAX_KANTE verkleinertes Foto (JPEG) - das Original wird nicht im Speicher gehalten */
  url: string;
  w: number;
  h: number;
  drehung: 0 | 90 | 180 | 270;
  filter: Filter;
};

export const MAX_KANTE = 2400; // ≈ 200 dpi auf A4 - reicht für Lesbarkeit und KI-Erkennung
const A4_BREITE = 595.28; // pt
const A4_HOEHE = 841.89;

export const FILTER_LABEL: Record<Filter, string> = { dokument: "Dokument", grau: "Graustufen", farbe: "Farbe" };
// Vorschau per CSS (schnell); das PDF wird mit der echten Bildbearbeitung (siehe bildRendern) erzeugt.
export const FILTER_CSS: Record<Filter, string> = {
  dokument: "grayscale(1) contrast(1.6) brightness(1.12)",
  grau: "grayscale(1) contrast(1.15)",
  farbe: "none",
};

// lokales Datum (nicht UTC), sonst gilt kurz nach Mitternacht noch der Vortag
export const heute = () => new Date().toLocaleDateString("sv-SE");

function bildLaden(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

function canvasZuBlob(c: HTMLCanvasElement, qualitaet: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Bild konnte nicht umgewandelt werden."))), "image/jpeg", qualitaet),
  );
}

/** Foto einlesen (Ausrichtung aus EXIF übernimmt der Browser) und auf MAX_KANTE verkleinern. */
export async function fotoVorbereiten(file: File): Promise<Omit<Seite, "id" | "drehung" | "filter">> {
  const quelle = URL.createObjectURL(file);
  try {
    const img = await bildLaden(quelle);
    const f = Math.min(1, MAX_KANTE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * f);
    const h = Math.round(img.naturalHeight * f);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const blob = await canvasZuBlob(c, 0.92);
    return { url: URL.createObjectURL(blob), w, h };
  } finally {
    URL.revokeObjectURL(quelle);
  }
}

/** Perzentil aus einem Helligkeits-Histogramm (256 Stufen). */
function perzentil(hist: Uint32Array, anzahl: number, p: number): number {
  const ziel = anzahl * p;
  let summe = 0;
  for (let i = 0; i < 256; i++) {
    summe += hist[i];
    if (summe >= ziel) return i;
  }
  return 255;
}

/**
 * Seite fürs PDF rendern: drehen, dann je Filter
 * - "grau": Graustufen + Kontrast auf 1.–99. Perzentil strecken
 * - "dokument": wie Scanner-App - Papier wird weiß (Weißpunkt aus dem Median, da das Papier
 *   den Großteil des Bildes ausmacht), Schrift kräftig dunkel; Schatten verschwinden weitgehend.
 */
export async function bildRendern(seite: Seite): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const img = await bildLaden(seite.url);
  const quer = seite.drehung % 180 !== 0;
  const w = quer ? seite.h : seite.w;
  const h = quer ? seite.w : seite.h;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: seite.filter !== "farbe" })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((seite.drehung * Math.PI) / 180);
  ctx.drawImage(img, -seite.w / 2, -seite.h / 2, seite.w, seite.h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (seite.filter !== "farbe") {
    const daten = ctx.getImageData(0, 0, w, h);
    const px = daten.data;
    const n = w * h;
    const lum = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      lum[j] = l;
      hist[lum[j]]++;
    }
    const dok = seite.filter === "dokument";
    const lo = perzentil(hist, n, dok ? 0.02 : 0.01);
    const hi = dok ? Math.max(lo + 30, perzentil(hist, n, 0.5) * 0.93) : Math.max(lo + 10, perzentil(hist, n, 0.99));
    const spanne = hi - lo;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.min(1, Math.max(0, (v - lo) / spanne));
      lut[v] = Math.round((dok ? Math.pow(t, 1.4) : t) * 255);
    }
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const v = lut[lum[j]];
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(daten, 0, 0);
  }

  const blob = await canvasZuBlob(c, 0.8);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

/** Alle Seiten zu einem PDF zusammensetzen - jede Seite in A4-Breite (Querformat: A4-quer-Breite). */
export async function pdfErzeugen(seiten: Seite[], fortschritt: (i: number) => void): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setProducer("werk · Scannen");
  pdf.setCreator("werk");
  for (let i = 0; i < seiten.length; i++) {
    fortschritt(i + 1);
    const r = await bildRendern(seiten[i]);
    const jpg = await pdf.embedJpg(r.bytes);
    const breite = r.w > r.h ? A4_HOEHE : A4_BREITE;
    const hoehe = (breite * r.h) / r.w;
    pdf.addPage([breite, hoehe]).drawImage(jpg, { x: 0, y: 0, width: breite, height: hoehe });
  }
  return pdf.save();
}
