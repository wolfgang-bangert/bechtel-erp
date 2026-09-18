/**
 * Zwei Seiten einer PDF nebeneinander auf eine neue (doppelt breite) Seite
 * setzen - z.B. 2x A4 -> 1x A3, gewählte linke Seite links, gewählte rechte
 * Seite rechts. Reine Byte-Verarbeitung, kein Storage-Zugriff hier (analog
 * zu pdfSplit.ts) - der Aufrufer lädt/speichert selbst.
 */
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

const PT_ZU_MM = 25.4 / 72;
const MM_ZU_PT = 72 / 25.4;
const mmZuPt = (mm: number) => mm * MM_ZU_PT;
const runden = (n: number, stellen = 1) => Math.round(n * 10 ** stellen) / 10 ** stellen;

export type Boxmass = { breitePt: number; hoehePt: number; breiteMm: number; hoeheMm: number };

function boxmass(b: { width: number; height: number }): Boxmass {
  return {
    breitePt: runden(b.width),
    hoehePt: runden(b.height),
    breiteMm: runden(b.width * PT_ZU_MM),
    hoeheMm: runden(b.height * PT_ZU_MM),
  };
}

export type SeitenBoxen = {
  seite: number; // 1-basiert
  mediaBox: Boxmass;
  cropBox: Boxmass;
  bleedBox: Boxmass;
  trimBox: Boxmass;
  artBox: Boxmass;
  rotation: number;
};

export type PdfMetadaten = {
  pageCount: number;
  titel: string | null;
  autor: string | null;
  ersteller: string | null; // Creator (erzeugende Anwendung)
  produzent: string | null; // Producer (PDF-Bibliothek)
  erstelltAm: string | null; // ISO
  geaendertAm: string | null; // ISO
  seiten: SeitenBoxen[];
};

/** Seitenzahl + alle Box-Maße (v.a. TrimBox) und Dokument-Metadaten, ohne
 *  pdf-lib in web/sync direkt als Abhängigkeit zu brauchen. Wirft bei
 *  ungültigen/beschädigten PDFs. */
export async function pdfMetadaten(bytes: Uint8Array): Promise<PdfMetadaten> {
  const doc = await PDFDocument.load(bytes);
  const seiten: SeitenBoxen[] = doc.getPages().map((p, i) => ({
    seite: i + 1,
    mediaBox: boxmass(p.getMediaBox()),
    cropBox: boxmass(p.getCropBox()),
    bleedBox: boxmass(p.getBleedBox()),
    trimBox: boxmass(p.getTrimBox()),
    artBox: boxmass(p.getArtBox()),
    rotation: p.getRotation().angle,
  }));
  return {
    pageCount: seiten.length,
    titel: doc.getTitle() ?? null,
    autor: doc.getAuthor() ?? null,
    ersteller: doc.getCreator() ?? null,
    produzent: doc.getProducer() ?? null,
    erstelltAm: doc.getCreationDate()?.toISOString() ?? null,
    geaendertAm: doc.getModificationDate()?.toISOString() ?? null,
    seiten,
  };
}

type Box = { x: number; y: number; width: number; height: number };
type Matrix6 = [number, number, number, number, number, number];

/**
 * pdf-lib embedded eine Seite immer "roh", ohne den eigenen /Rotate-Eintrag
 * zu berücksichtigen (getestet: embedPages() ignoriert die Rotation komplett -
 * Inhalt kommt unverändert raus, auch wenn die Seite z.B. auf 90°/180°
 * gedreht angezeigt werden soll). Ohne diese Funktion würde eine gedrehte
 * Quellseite (häufig bei "Wende"-Produkten, wo die zweite Hälfte auf den Kopf
 * gestellt ist) falsch (ungedreht) im Ergebnis landen.
 *
 * Baut die Rotation direkt in eine Transformationsmatrix ein (Rotation +
 * Verschiebung, sodass der rotierte Inhalt bei (0,0) beginnt) und rendert die
 * Seite einmal in ein Zwischendokument, mit allen Boxen entsprechend gedreht.
 * Seiten mit Rotate=0 (der Normalfall) bleiben unverändert.
 */
function rotationsMatrix(winkel: 90 | 180 | 270, media: Box): Matrix6 {
  const { x: bx, y: by, width: bw, height: bh } = media;
  switch (winkel) {
    case 90:
      return [0, -1, 1, 0, -by, bx + bw];
    case 180:
      return [-1, 0, 0, -1, bx + bw, by + bh];
    case 270:
      return [0, 1, -1, 0, by + bh, -bx];
  }
}

function transformPunkt(m: Matrix6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function transformBox(m: Matrix6, box: Box): Box {
  const ecken = [
    transformPunkt(m, box.x, box.y),
    transformPunkt(m, box.x + box.width, box.y),
    transformPunkt(m, box.x, box.y + box.height),
    transformPunkt(m, box.x + box.width, box.y + box.height),
  ];
  const xs = ecken.map((e) => e[0]);
  const ys = ecken.map((e) => e[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

async function normalisierteSeite(quellPage: PDFPage): Promise<PDFPage> {
  const winkel = ((quellPage.getRotation().angle % 360) + 360) % 360;
  if (winkel !== 90 && winkel !== 180 && winkel !== 270) return quellPage; // 0° (Normalfall) oder unerwarteter Wert

  const media = quellPage.getMediaBox();
  const mat = rotationsMatrix(winkel, media);
  const neuMedia = transformBox(mat, media);

  const zwischendoc = await PDFDocument.create();
  const bbox = {
    left: media.x,
    bottom: media.y,
    right: media.x + media.width,
    top: media.y + media.height,
  };
  const [embedded] = await zwischendoc.embedPages([quellPage], [bbox], [mat]);
  const neuePage = zwischendoc.addPage([neuMedia.width, neuMedia.height]);
  // Keine width/height angeben: die Rotation steckt schon in der Matrix, eine
  // zusätzliche Skalierung über drawPage würde mit embeddedPage.width/height
  // (den UNgedrehten Rohmaßen) rechnen und das Ergebnis verzerren.
  neuePage.drawPage(embedded, { x: 0, y: 0 });

  const setzeBox = (box: Box, set: (x: number, y: number, w: number, h: number) => void) => {
    const b = transformBox(mat, box);
    set(b.x, b.y, b.width, b.height);
  };
  setzeBox(quellPage.getTrimBox(), (x, y, w, h) => neuePage.setTrimBox(x, y, w, h));
  setzeBox(quellPage.getBleedBox(), (x, y, w, h) => neuePage.setBleedBox(x, y, w, h));
  setzeBox(quellPage.getCropBox(), (x, y, w, h) => neuePage.setCropBox(x, y, w, h));
  setzeBox(quellPage.getArtBox(), (x, y, w, h) => neuePage.setArtBox(x, y, w, h));

  return neuePage;
}

// Marken brauchen Platz JENSEITS des Beschnitts - bei echten Druck-PDFs ist
// der Beschnitt selbst oft nur 3mm, das reicht für Lücke+Marke nicht aus
// (beobachtet: 3mm Beschnitt ließ nur ~1mm für die Marke übrig, praktisch
// unsichtbar). Deshalb bekommt die Ergebnisseite einen eigenen zusätzlichen
// Rand nur für die Marken, zusätzlich zum ggf. vorhandenen Original-Beschnitt -
// exakt wie bei einer normal ausgeschossenen Druckvorlage (MediaBox >
// BleedBox), unabhängig davon wie viel (oder wenig) Beschnitt die Quelle hat.
const MARKEN_RAND = mmZuPt(5);
const MARKEN_LAENGE = mmZuPt(4);
const MARKEN_DICKE = 0.5;

/** Schneidezeichen an einer Ecke des Trimbereichs - je eine kurze horizontale
 *  und vertikale Linie, beginnend am Rand des originalen Beschnitts (gapX/
 *  gapY) und hineinragend in den zusätzlichen Marken-Rand. */
function eckmarke(
  page: PDFPage,
  ecke: { x: number; y: number; dx: -1 | 1; dy: -1 | 1; gapX: number; gapY: number },
) {
  const farbe = rgb(0, 0, 0);
  page.drawLine({
    start: { x: ecke.x + ecke.dx * ecke.gapX, y: ecke.y },
    end: { x: ecke.x + ecke.dx * (ecke.gapX + MARKEN_LAENGE), y: ecke.y },
    thickness: MARKEN_DICKE,
    color: farbe,
  });
  page.drawLine({
    start: { x: ecke.x, y: ecke.y + ecke.dy * ecke.gapY },
    end: { x: ecke.x, y: ecke.y + ecke.dy * (ecke.gapY + MARKEN_LAENGE) },
    thickness: MARKEN_DICKE,
    color: farbe,
  });
}

/** Schneidezeichen an den 4 echten Außenecken des kombinierten Endformats
 *  (nicht an der Naht in der Mitte - das ist eine Falz-/Stoßkante, keine
 *  Schnittkante). gapLinks/gapRechts/gapUnten/gapOben: der jeweils an dieser
 *  Kante vorhandene originale Beschnitt - die Marke setzt direkt dahinter an,
 *  statt den Beschnitt zu überdecken. */
function zeichneSchnittmarken(
  page: PDFPage,
  trim: Box,
  gaps: { links: number; rechts: number; unten: number; oben: number },
) {
  const links = trim.x;
  const rechts = trim.x + trim.width;
  const unten = trim.y;
  const oben = trim.y + trim.height;

  eckmarke(page, { x: links, y: unten, dx: -1, dy: -1, gapX: gaps.links, gapY: gaps.unten });
  eckmarke(page, { x: rechts, y: unten, dx: 1, dy: -1, gapX: gaps.rechts, gapY: gaps.unten });
  eckmarke(page, { x: links, y: oben, dx: -1, dy: 1, gapX: gaps.links, gapY: gaps.oben });
  eckmarke(page, { x: rechts, y: oben, dx: 1, dy: 1, gapX: gaps.rechts, gapY: gaps.oben });
}

/**
 * Seitenzahlen sind 1-basiert (wie im UI angezeigt). Die innere Naht (rechte
 * Kante links / linke Kante rechts) liegt exakt auf Endformat - kein
 * Beschnitt, keine Schneidezeichen dort (Falz-/Stoßkante, keine Schnittkante).
 * Die 3 äußeren Kanten jeder Seite behalten ihren originalen Beschnitt
 * (BleedBox), außen kommen wieder Schneidezeichen dazu - wie bei einer
 * normal ausgeschossenen Druckvorlage.
 */
export async function seitenNebeneinander(
  bytes: Uint8Array,
  linkeSeite: number,
  rechteSeite: number,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();

  for (const [label, n] of [
    ["Linke", linkeSeite],
    ["Rechte", rechteSeite],
  ] as const) {
    if (!Number.isInteger(n) || n < 1 || n > pageCount) {
      throw new Error(`${label} Seite (${n}) liegt außerhalb von 1-${pageCount}.`);
    }
  }

  // Gedrehte Seiten (z.B. "Wende"-Produkte mit auf den Kopf gestellter
  // zweiter Hälfte) erst auf Rotate=0 normalisieren - sonst embedPages()
  // ignoriert die Rotation und der Inhalt landet ungedreht im Ergebnis.
  const linksPage = await normalisierteSeite(src.getPage(linkeSeite - 1));
  const rechtsPage = await normalisierteSeite(src.getPage(rechteSeite - 1));

  const lTrim = linksPage.getTrimBox();
  const lBleed = linksPage.getBleedBox();
  const rTrim = rechtsPage.getTrimBox();
  const rBleed = rechtsPage.getBleedBox();

  // Embed-BoundingBox je Seite: außen bis zur BleedBox, innen (Naht) hart auf
  // TrimBox gekappt - sonst würde die BleedBox der Nachbarseite überlappen.
  const linksBB = {
    left: lBleed.x,
    bottom: lBleed.y,
    right: lTrim.x + lTrim.width,
    top: lBleed.y + lBleed.height,
  };
  const rechtsBB = {
    left: rTrim.x,
    bottom: rBleed.y,
    right: rBleed.x + rBleed.width,
    top: rBleed.y + rBleed.height,
  };

  const out = await PDFDocument.create();
  // Einzeln statt gebündelt via embedPages(): links/rechts können aus
  // unterschiedlichen Dokumenten stammen (z.B. wenn nur eine der beiden
  // Seiten in normalisierteSeite() in ein Zwischendokument gerendert wurde) -
  // embedPages() verlangt dagegen denselben Kontext für alle Seiten im Array.
  const links = await out.embedPage(linksPage, linksBB);
  const rechts = await out.embedPage(rechtsPage, rechtsBB);

  // Beide Seiten auf dieselbe Trimhöhe skalieren (Normalfall: identisch,
  // ändert nichts), damit die Naht exakt passt.
  const trimHoehe = Math.max(lTrim.height, rTrim.height);
  const scaleL = trimHoehe / lTrim.height;
  const scaleR = trimHoehe / rTrim.height;

  const linksBreite = links.width * scaleL;
  const linksHoehe = links.height * scaleL;
  const rechtsBreite = rechts.width * scaleR;
  const rechtsHoehe = rechts.height * scaleR;

  const beschnittLinksAussen = (lTrim.x - lBleed.x) * scaleL;
  const beschnittUntenL = (lTrim.y - lBleed.y) * scaleL;
  const beschnittObenL = (lBleed.y + lBleed.height - (lTrim.y + lTrim.height)) * scaleL;

  const beschnittRechtsAussen = (rBleed.x + rBleed.width - (rTrim.x + rTrim.width)) * scaleR;
  const beschnittUntenR = (rTrim.y - rBleed.y) * scaleR;
  const beschnittObenR = (rBleed.y + rBleed.height - (rTrim.y + rTrim.height)) * scaleR;

  const beschnittUnten = Math.max(beschnittUntenL, beschnittUntenR);
  const beschnittOben = Math.max(beschnittObenL, beschnittObenR);

  // Alles (Inhalt + Beschnitt) um MARKEN_RAND nach innen verschoben - der so
  // freiwerdende äußere Rand ist ausschließlich für die Schneidezeichen da.
  const naht = MARKEN_RAND + beschnittLinksAussen + lTrim.width * scaleL; // x-Koordinate der Stoßkante
  const trimBreiteGesamt = lTrim.width * scaleL + rTrim.width * scaleR;
  const pageWidth = naht + rTrim.width * scaleR + beschnittRechtsAussen + MARKEN_RAND;
  const pageHeight = MARKEN_RAND + beschnittUnten + trimHoehe + beschnittOben + MARKEN_RAND;
  const trimY = MARKEN_RAND + beschnittUnten;

  const neueSeite = out.addPage([pageWidth, pageHeight]);
  neueSeite.drawPage(links, {
    x: naht - linksBreite,
    y: trimY - beschnittUntenL,
    width: linksBreite,
    height: linksHoehe,
  });
  neueSeite.drawPage(rechts, {
    x: naht,
    y: trimY - beschnittUntenR,
    width: rechtsBreite,
    height: rechtsHoehe,
  });

  const trim: Box = { x: MARKEN_RAND + beschnittLinksAussen, y: trimY, width: trimBreiteGesamt, height: trimHoehe };
  zeichneSchnittmarken(neueSeite, trim, {
    links: beschnittLinksAussen,
    rechts: beschnittRechtsAussen,
    unten: beschnittUnten,
    oben: beschnittOben,
  });
  neueSeite.setTrimBox(trim.x, trim.y, trim.width, trim.height);
  neueSeite.setBleedBox(
    MARKEN_RAND,
    MARKEN_RAND,
    pageWidth - 2 * MARKEN_RAND,
    pageHeight - 2 * MARKEN_RAND,
  );

  return out.save();
}
