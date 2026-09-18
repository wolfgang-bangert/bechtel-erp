/**
 * Zwei Seiten einer PDF nebeneinander auf eine neue (doppelt breite) Seite
 * setzen - z.B. 2x A4 -> 1x A3, gewählte linke Seite links, gewählte rechte
 * Seite rechts. Reine Byte-Verarbeitung, kein Storage-Zugriff hier (analog
 * zu pdfSplit.ts) - der Aufrufer lädt/speichert selbst.
 */
import { PDFDocument, type PDFPage } from "pdf-lib";

const PT_ZU_MM = 25.4 / 72;
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

/** TrimBox (Endformat nach dem Schnitt) als Embed-BoundingBox - ohne das
 *  würde embedPdf() die volle MediaBox nehmen und Beschnitt/Schneidezeichen
 *  blieben im Ergebnis sichtbar. Ohne gesetzte TrimBox fällt pdf-lib auf
 *  CropBox bzw. MediaBox zurück (unverändertes Verhalten für solche PDFs). */
function trimBoundingBox(page: PDFPage) {
  const { x, y, width, height } = page.getTrimBox();
  return { left: x, bottom: y, right: x + width, top: y + height };
}

/** Seitenzahlen sind 1-basiert (wie im UI angezeigt). */
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

  const linksPage = src.getPage(linkeSeite - 1);
  const rechtsPage = src.getPage(rechteSeite - 1);

  const out = await PDFDocument.create();
  const [links, rechts] = await out.embedPages(
    [linksPage, rechtsPage],
    [trimBoundingBox(linksPage), trimBoundingBox(rechtsPage)],
  );

  // Beide Quellseiten auf gleiche Höhe skalieren (bei exakt gleich großen
  // Seiten - dem Normalfall, z.B. 2x A4 - ändert das nichts) und
  // nebeneinander auf eine neue Seite zeichnen.
  const height = Math.max(links.height, rechts.height);
  const linksBreite = links.width * (height / links.height);
  const rechtsBreite = rechts.width * (height / rechts.height);

  const page = out.addPage([linksBreite + rechtsBreite, height]);
  page.drawPage(links, { x: 0, y: 0, width: linksBreite, height });
  page.drawPage(rechts, { x: linksBreite, y: 0, width: rechtsBreite, height });

  return out.save();
}
