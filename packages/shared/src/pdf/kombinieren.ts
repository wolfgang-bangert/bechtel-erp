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

// ---------------------------------------------------------------------------
// Affine 2D-Hilfsfunktionen für die Rotationsbehandlung.
//
// pdf-lib embeddet eine Seite immer "roh", ohne ihren eigenen /Rotate-Eintrag
// zu berücksichtigen (durch einen isolierten Test bestätigt: der Inhalt einer
// auf 90°/180° gedrehten Quellseite kommt unverändert/ungedreht raus). Häufig
// bei "Wende"-Produkten, wo die zweite Buchhälfte auf den Kopf gestellt ist.
//
// Alles läuft in EINEM embedPage()-Aufruf pro Seite (nicht über ein
// Zwischendokument!) - ein zweiter Test hat gezeigt, dass eine Seite, die
// selbst schon eine eingebettete Seite enthält, beim nochmaligen Einbetten in
// ein drittes Dokument ihren Inhalt komplett verliert (leere Seite statt
// Fehler). Die Rotation steckt deshalb direkt in der an embedPage()
// übergebenen Matrix, zusammen mit der Verschiebung (Box -> Ursprung) und der
// späteren Skalierung (fürs Angleichen der Trimhöhen) - alles in einer Matrix.
// ---------------------------------------------------------------------------

function rotationsMatrix(winkel: 0 | 90 | 180 | 270, box: Box): Matrix6 {
  const { x: bx, y: by, width: bw, height: bh } = box;
  switch (winkel) {
    case 0:
      return [1, 0, 0, 1, -bx, -by];
    case 90:
      return [0, -1, 1, 0, -by, bx + bw];
    case 180:
      return [-1, 0, 0, -1, bx + bw, by + bh];
    case 270:
      return [0, 1, -1, 0, by + bh, -bx];
  }
}

function normWinkel(angle: number): 0 | 90 | 180 | 270 {
  const w = ((angle % 360) + 360) % 360;
  return w === 90 || w === 180 || w === 270 ? w : 0;
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

function invertMatrix([a, b, c, d, e, f]: Matrix6): Matrix6 {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function skaliereMatrix(m: Matrix6, s: number): Matrix6 {
  return [m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] * s, m[5] * s];
}

/**
 * Bereitet eine Quellseite fürs Kombinieren vor: rotationskorrigierte
 * ("visuelle") Trimhöhe + Beschnitt an den 3 äußeren Kanten, dazu die
 * BoundingBox (in der ROHEN/unrotierten Koordinaten der Quellseite - genau
 * dort clippt embedPage()) und eine Basismatrix, die Rotation + Verschiebung
 * (Box -> Ursprung) in einem Schritt erledigt. Die Naht-Seite (rechte Kante
 * links / linke Kante rechts) wird hart auf TrimBox gekappt - das ist eine
 * Falz-/Stoßkante, keine Schnittkante, dort braucht es keinen Beschnitt.
 */
function bereiteSeiteVor(page: PDFPage, position: "links" | "rechts") {
  const winkel = normWinkel(page.getRotation().angle);
  const rawTrim = page.getTrimBox();
  const rawBleed = page.getBleedBox();

  // Rotationsmatrix, verankert an der BleedBox (beliebiger, aber
  // konsistenter Anker) - ergibt "visuelle" (rotationskorrigierte)
  // Koordinaten mit der BleedBox bei (0,0).
  const matBleed = rotationsMatrix(winkel, rawBleed);
  const visTrim = transformBox(matBleed, rawTrim);
  const visBleed = transformBox(matBleed, rawBleed); // == {x:0, y:0, width, height}

  const visMixedBB: Box =
    position === "links"
      ? { x: 0, y: 0, width: visTrim.x + visTrim.width, height: visBleed.height }
      : { x: visTrim.x, y: 0, width: visBleed.width - visTrim.x, height: visBleed.height };

  // Dieselbe Rotation, jetzt so verschoben, dass visMixedBB bei (0,0) beginnt.
  const matBasis: Matrix6 = [
    matBleed[0],
    matBleed[1],
    matBleed[2],
    matBleed[3],
    matBleed[4] - visMixedBB.x,
    matBleed[5] - visMixedBB.y,
  ];
  // BoundingBox für embedPage() muss in ROHEN Quellkoordinaten sein (PDF Form
  // XObjects clippen vor Anwendung der Matrix) - visMixedBB durch die
  // Umkehrung von matBleed zurückrechnen.
  const rawMixedBB = transformBox(invertMatrix(matBleed), visMixedBB);

  const beschnittAussen =
    position === "links"
      ? visTrim.x // Abstand Beschnitt-links -> Trim-links
      : visBleed.width - (visTrim.x + visTrim.width); // Abstand Trim-rechts -> Beschnitt-rechts

  return {
    page,
    matBasis,
    rawBB: {
      left: rawMixedBB.x,
      bottom: rawMixedBB.y,
      right: rawMixedBB.x + rawMixedBB.width,
      top: rawMixedBB.y + rawMixedBB.height,
    },
    breite: visMixedBB.width,
    hoehe: visMixedBB.height,
    trimHoehe: visTrim.height,
    beschnittAussen,
    beschnittUnten: visTrim.y,
    beschnittOben: visBleed.height - (visTrim.y + visTrim.height),
  };
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
 * normal ausgeschossenen Druckvorlage. Gedrehte Quellseiten (z.B. "Wende"-
 * Produkte) werden dabei korrekt gedreht.
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

  const L = bereiteSeiteVor(src.getPage(linkeSeite - 1), "links");
  const R = bereiteSeiteVor(src.getPage(rechteSeite - 1), "rechts");

  // Beide Seiten auf dieselbe Trimhöhe skalieren (Normalfall: identisch,
  // ändert nichts), damit die Naht exakt passt.
  const trimHoehe = Math.max(L.trimHoehe, R.trimHoehe);
  const scaleL = trimHoehe / L.trimHoehe;
  const scaleR = trimHoehe / R.trimHoehe;

  const out = await PDFDocument.create();
  // Einzeln statt gebündelt via embedPages(): links/rechts können aus
  // unterschiedlichen Quell-Rotationszuständen stammen; die Skalierung steckt
  // direkt in der Matrix, drawPage() bekommt deshalb bewusst keine eigene
  // width/height mehr (das würde mit den unrotierten Rohmaßen rechnen).
  const linksEmbed = await out.embedPage(L.page, L.rawBB, skaliereMatrix(L.matBasis, scaleL));
  const rechtsEmbed = await out.embedPage(R.page, R.rawBB, skaliereMatrix(R.matBasis, scaleR));

  const linksBreite = L.breite * scaleL;
  const linksHoehe = L.hoehe * scaleL;
  const rechtsBreite = R.breite * scaleR;
  const rechtsHoehe = R.hoehe * scaleR;

  const beschnittLinksAussen = L.beschnittAussen * scaleL;
  const beschnittUntenL = L.beschnittUnten * scaleL;
  const beschnittObenL = L.beschnittOben * scaleL;

  const beschnittRechtsAussen = R.beschnittAussen * scaleR;
  const beschnittUntenR = R.beschnittUnten * scaleR;
  const beschnittObenR = R.beschnittOben * scaleR;

  const beschnittUnten = Math.max(beschnittUntenL, beschnittUntenR);
  const beschnittOben = Math.max(beschnittObenL, beschnittObenR);

  // Alles (Inhalt + Beschnitt) um MARKEN_RAND nach innen verschoben - der so
  // freiwerdende äußere Rand ist ausschließlich für die Schneidezeichen da.
  const naht = MARKEN_RAND + beschnittLinksAussen + (linksBreite - beschnittLinksAussen); // x-Koordinate der Stoßkante
  const trimBreiteGesamt = (linksBreite - beschnittLinksAussen) + (rechtsBreite - beschnittRechtsAussen);
  const pageWidth = naht + (rechtsBreite - beschnittRechtsAussen) + beschnittRechtsAussen + MARKEN_RAND;
  const pageHeight = MARKEN_RAND + beschnittUnten + trimHoehe + beschnittOben + MARKEN_RAND;
  const trimY = MARKEN_RAND + beschnittUnten;

  const neueSeite = out.addPage([pageWidth, pageHeight]);
  neueSeite.drawPage(linksEmbed, { x: naht - linksBreite, y: trimY - beschnittUntenL });
  neueSeite.drawPage(rechtsEmbed, { x: naht, y: trimY - beschnittUntenR });

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
