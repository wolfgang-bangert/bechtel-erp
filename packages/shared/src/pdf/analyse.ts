/**
 * Grobe Einschätzung, ob eine PDF-Seite farbig oder s/w ist - direkt aus den
 * Content-Stream-Operatoren (rg/RG/k/K/g/G/sc/scn), ohne echtes Rendern.
 * Gedacht als schnelle Vorab-Schätzung für eine Kalkulation (z.B. Druckkosten
 * je nach farbig/s-w), NICHT pixelgenau - eingebettete Bilder werden separat
 * markiert statt geraten, weil ihre tatsächliche Farbigkeit ohne Rendern
 * (Rasterisierung, z.B. via poppler/pdftoppm) nicht zuverlässig aus dem
 * Farbraum-Eintrag allein folgt.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
  type PDFPage,
} from "pdf-lib";

export type SeitenEinschaetzung = "farbig" | "s/w" | "s/w (nur Bilder, ungeprüft)";

export type SeitenFarbe = { seite: number; einschaetzung: SeitenEinschaetzung };

/** latin1/ISO-8859-1-Dekodierung ohne Buffer (Node) - läuft so unverändert
 *  auch im Browser (dieses Modul wird client-seitig im Analyse-Werkzeug
 *  eingebunden, damit Preislisten-Dateien nie hochgeladen werden müssen). */
function latin1Decode(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function streamText(stream: PDFRawStream): string {
  try {
    return latin1Decode(decodePDFRawStream(stream).decode());
  } catch {
    return "";
  }
}

function seitenInhaltText(page: PDFPage): string {
  const contents = page.node.Contents();
  if (!contents) return "";
  if (contents instanceof PDFArray) {
    const teile: string[] = [];
    for (let i = 0; i < contents.size(); i++) {
      const s = contents.lookupMaybe(i, PDFRawStream);
      if (s) teile.push(streamText(s));
    }
    return teile.join("\n");
  }
  if (contents instanceof PDFRawStream) return streamText(contents);
  return "";
}

/** true, wenn ein Farbwert (0-1) klar von grau (r≈g≈b bzw. c=m=y=0)
 *  abweicht - kleine Rundungstoleranz für Rundungsfehler in der PDF. */
const EPS = 0.01;
const istGrauRGB = (r: number, g: number, b: number) =>
  Math.abs(r - g) < EPS && Math.abs(g - b) < EPS;
const istGrauCMYK = (c: number, m: number, y: number) => c < EPS && m < EPS && y < EPS;

const NUM = "(-?[0-9.]+)";
const RE_RG = new RegExp(`${NUM}\\s+${NUM}\\s+${NUM}\\s+rg`, "g");
const RE_RG_STROKE = new RegExp(`${NUM}\\s+${NUM}\\s+${NUM}\\s+RG`, "g");
const RE_K = new RegExp(`${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+k\\b`, "g");
const RE_K_STROKE = new RegExp(`${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+K\\b`, "g");
// sc/scn/SC/SCN: Anzahl Operanden ist farbraumabhängig - 3 Operanden vor sc/scn
// deuten i.d.R. auf RGB hin, 4 auf CMYK; konservativ auch prüfen.
const RE_SCN3 = new RegExp(`${NUM}\\s+${NUM}\\s+${NUM}\\s+scn?`, "g");
const RE_SCN4 = new RegExp(`${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+scn?`, "g");

function hatFarbOperator(text: string): boolean {
  for (const re of [RE_RG, RE_RG_STROKE]) {
    for (const m of text.matchAll(re)) {
      if (!istGrauRGB(Number(m[1]), Number(m[2]), Number(m[3]))) return true;
    }
  }
  for (const re of [RE_K, RE_K_STROKE]) {
    for (const m of text.matchAll(re)) {
      if (!istGrauCMYK(Number(m[1]), Number(m[2]), Number(m[3])))
        return true; // 4. Wert (k/K) ignoriert - reines Schwarz hat c=m=y=0
    }
  }
  for (const m of text.matchAll(RE_SCN4)) {
    if (!istGrauCMYK(Number(m[1]), Number(m[2]), Number(m[3]))) return true;
  }
  for (const m of text.matchAll(RE_SCN3)) {
    if (!istGrauRGB(Number(m[1]), Number(m[2]), Number(m[3]))) return true;
  }
  return false;
}

function hatBilder(page: PDFPage): boolean {
  const resources = page.node.Resources();
  if (!resources) return false;
  const xobjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return false;
  for (const key of xobjects.keys()) {
    const xobj = xobjects.lookupMaybe(key, PDFStream);
    const subtype = xobj?.dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
    if (subtype?.asString() === "/Image") return true;
  }
  return false;
}

export async function schaetzeFarbigkeit(doc: { getPages(): PDFPage[] }): Promise<SeitenFarbe[]> {
  return doc.getPages().map((page, i) => {
    const text = seitenInhaltText(page);
    if (hatFarbOperator(text)) return { seite: i + 1, einschaetzung: "farbig" as const };
    if (hatBilder(page)) return { seite: i + 1, einschaetzung: "s/w (nur Bilder, ungeprüft)" as const };
    return { seite: i + 1, einschaetzung: "s/w" as const };
  });
}

export type DateiAnalyse = {
  pageCount: number;
  farbig: number;
  sw: number;
  bilderUngeprueft: number;
};

/** Eine PDF komplett analysieren (Seitenzahl + Farbig/s-w-Schätzung je Seite,
 *  aufsummiert). Wirft bei ungültigen/beschädigten PDFs. */
export async function analysiereDatei(bytes: Uint8Array): Promise<DateiAnalyse> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const farben = await schaetzeFarbigkeit(doc);
  return {
    pageCount: doc.getPageCount(),
    farbig: farben.filter((f) => f.einschaetzung === "farbig").length,
    sw: farben.filter((f) => f.einschaetzung === "s/w").length,
    bilderUngeprueft: farben.filter((f) => f.einschaetzung.includes("Bilder")).length,
  };
}
