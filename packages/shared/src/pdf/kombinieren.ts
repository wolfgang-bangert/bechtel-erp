/**
 * Zwei Seiten einer PDF nebeneinander auf eine neue (doppelt breite) Seite
 * setzen - z.B. 2x A4 -> 1x A3, gewählte linke Seite links, gewählte rechte
 * Seite rechts. Reine Byte-Verarbeitung, kein Storage-Zugriff hier (analog
 * zu pdfSplit.ts) - der Aufrufer lädt/speichert selbst.
 */
import { PDFDocument } from "pdf-lib";

/** Seitenzahl einer PDF auslesen, ohne pdf-lib in web/sync direkt als
 *  Abhängigkeit zu brauchen. Wirft bei ungültigen/beschädigten PDFs. */
export async function seitenzahl(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
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

  const out = await PDFDocument.create();
  const [links, rechts] = await out.embedPdf(bytes, [linkeSeite - 1, rechteSeite - 1]);

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
