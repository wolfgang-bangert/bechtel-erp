/**
 * Bildverarbeitung fürs Scannen im Browser: Foto verkleinern, drehen, "Dokument"-Filter
 * (Papier weiß, Schrift kräftig) und alle Seiten zu einem PDF zusammensetzen (pdf-lib).
 * Zuschneiden/Entzerren: Rechenlogik in zuschnitt.ts, hier nur die Anbindung an Canvas.
 */

import { eckenErkennen, entzerren, istGanzesBild, zielGroesse, type Ecken } from "./zuschnitt";

export type Filter = "farbe" | "grau" | "dokument";
export type Seite = {
  id: string;
  /** auf max. MAX_KANTE verkleinertes Foto (JPEG) - das Original wird nicht im Speicher gehalten */
  url: string;
  w: number;
  h: number;
  drehung: 0 | 90 | 180 | 270;
  filter: Filter;
  /** Blatt-Ecken (Anteile 0…1 am ungedrehten Foto); null = ganzes Bild */
  ecken: Ecken | null;
  /** kleine, zugeschnittene Vorschau (nur wenn ecken gesetzt) */
  vorschau: string | null;
};

export const MAX_KANTE = 2400; // ≈ 200 dpi auf A4 - reicht für Lesbarkeit und KI-Erkennung
const A4_BREITE = 595.28; // pt
const A4_HOEHE = 841.89;
const ERKENNUNG_KANTE = 400; // Erkennung auf verkleinertem Bild - schnell und robust gegen Schrift
const VORSCHAU_KANTE = 600;

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

/** Bild (verkleinert auf maxKante) als Pixel lesen. */
function pixelLesen(img: CanvasImageSource, w: number, h: number, maxKante: number): ImageData {
  const f = Math.min(1, maxKante / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * f));
  c.height = Math.max(1, Math.round(h * f));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** Blatt entlang der Ecken ausschneiden und entzerren (Ergebnis höchstens maxKante groß). */
function zuschneiden(img: CanvasImageSource, w: number, h: number, ecken: Ecken, maxKante: number): HTMLCanvasElement {
  const ziel = zielGroesse(ecken, w, h, maxKante);
  // für die kleine Vorschau reicht eine verkleinerte Quelle; fürs PDF volle Auflösung
  const quelle = pixelLesen(img, w, h, Math.min(Math.max(w, h), maxKante * 1.5));
  const c = document.createElement("canvas");
  c.width = ziel.w;
  c.height = ziel.h;
  c.getContext("2d")!.putImageData(new ImageData(entzerren(quelle, ecken, ziel), ziel.w, ziel.h), 0, 0);
  return c;
}

/** Blatt im Foto (erneut) automatisch suchen. */
export async function eckenSuchen(url: string, w: number, h: number): Promise<Ecken | null> {
  const img = await bildLaden(url);
  return eckenErkennen(pixelLesen(img, w, h, ERKENNUNG_KANTE));
}

/** Kleine zugeschnittene Vorschau für die Seitenübersicht; null = ganzes Bild (Foto selbst zeigen). */
export async function vorschauErzeugen(url: string, w: number, h: number, ecken: Ecken | null): Promise<string | null> {
  if (!ecken || istGanzesBild(ecken)) return null;
  const img = await bildLaden(url);
  return URL.createObjectURL(await canvasZuBlob(zuschneiden(img, w, h, ecken, VORSCHAU_KANTE), 0.85));
}

/**
 * Foto einlesen (Ausrichtung aus EXIF übernimmt der Browser), auf MAX_KANTE verkleinern und
 * das Blatt automatisch suchen (mitZuschnitt).
 */
export async function fotoVorbereiten(
  file: File,
  mitZuschnitt = true,
): Promise<Omit<Seite, "id" | "drehung" | "filter">> {
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
    const url = URL.createObjectURL(blob);
    const ecken = mitZuschnitt ? eckenErkennen(pixelLesen(c, w, h, ERKENNUNG_KANTE)) : null;
    return { url, w, h, ecken, vorschau: await vorschauErzeugen(url, w, h, ecken) };
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
 * Papierhelligkeit je Pixel schätzen: Bild in Blöcke (~1/30 der Seite) teilen, je Block die
 * Durchschnittshelligkeit, dann je Block das Maximum der Nachbarn (Schrift fällt so heraus) und
 * bilinear zurück auf volle Größe.
 */
function hintergrund(lum: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const b = Math.max(8, Math.round(Math.max(w, h) / 30));
  const bw = Math.ceil(w / b);
  const bh = Math.ceil(h / b);
  const summe = new Float64Array(bw * bh);
  const anzahl = new Uint32Array(bw * bh);
  for (let y = 0; y < h; y++) {
    const by = ((y / b) | 0) * bw;
    for (let x = 0; x < w; x++) {
      const k = by + ((x / b) | 0);
      summe[k] += lum[y * w + x];
      anzahl[k]++;
    }
  }
  const mittel = new Float64Array(bw * bh);
  for (let k = 0; k < mittel.length; k++) mittel[k] = summe[k] / anzahl[k];
  const block = new Float64Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) m = Math.max(m, mittel[yy * bw + xx]);
        }
      block[y * bw + x] = m;
    }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1, Math.max(0, y / b - 0.5));
    const y0 = fy | 0;
    const y1 = Math.min(bh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1, Math.max(0, x / b - 0.5));
      const x0 = fx | 0;
      const x1 = Math.min(bw - 1, x0 + 1);
      const tx = fx - x0;
      const o = block[y0 * bw + x0] + (block[y0 * bw + x1] - block[y0 * bw + x0]) * tx;
      const u = block[y1 * bw + x0] + (block[y1 * bw + x1] - block[y1 * bw + x0]) * tx;
      out[y * w + x] = o + (u - o) * ty;
    }
  }
  return out;
}

/**
 * Seite fürs PDF rendern: zuschneiden/entzerren, drehen, dann je Filter
 * - "grau": Graustufen + Kontrast auf 1.–99. Perzentil strecken
 * - "dokument": wie Scanner-App - Helligkeit durch die geschätzte Papierhelligkeit an jeder
 *   Stelle teilen (siehe hintergrund), dann Papier weiß, Schrift kräftig dunkel.
 */
export async function bildRendern(seite: Seite): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const foto = await bildLaden(seite.url);
  const zu = seite.ecken && !istGanzesBild(seite.ecken);
  const img: CanvasImageSource = zu ? zuschneiden(foto, seite.w, seite.h, seite.ecken!, MAX_KANTE) : foto;
  const bw = zu ? (img as HTMLCanvasElement).width : seite.w;
  const bh = zu ? (img as HTMLCanvasElement).height : seite.h;
  const quer = seite.drehung % 180 !== 0;
  const w = quer ? bh : bw;
  const h = quer ? bw : bh;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: seite.filter !== "farbe" })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((seite.drehung * Math.PI) / 180);
  ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
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
    const lut = new Uint8ClampedArray(256);
    if (seite.filter === "dokument") {
      // Papierhelligkeit je Stelle schätzen und herausrechnen - Schatten und Lichtverlauf verschwinden
      const bg = hintergrund(lum, w, h);
      const norm = new Uint8ClampedArray(n);
      const nh = new Uint32Array(256);
      for (let j = 0; j < n; j++) {
        norm[j] = Math.min(255, (lum[j] * 255) / Math.max(1, bg[j]));
        nh[norm[j]]++;
      }
      // Schwarzpunkt: dunkelste 0,5 % - aber nie heller als 100, sonst würde bei wenig Text alles hart
      const lo = Math.min(perzentil(nh, n, 0.005), 100);
      const hi = 235; // alles ab ~92 % der Papierhelligkeit wird weiß
      for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), 1.4) * 255);
      lum.set(norm);
    } else {
      const lo = perzentil(hist, n, 0.01);
      const hi = Math.max(lo + 10, perzentil(hist, n, 0.99));
      for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * 255);
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
