/**
 * Beliebig viele PDFs zusammenführen und ihre Seiten in einer frei
 * bestimmten Reihenfolge neu zusammenstellen - deckt Umsortieren, einzelne
 * Seiten löschen (einfach weglassen) und Mehrfach-Merge in einem ab. Reine
 * Byte-Verarbeitung, kein Storage-Zugriff hier (analog zu kombinieren.ts).
 *
 * Nutzt copyPages() statt embedPage() (wie kombinieren.ts) - hier wird
 * nichts auf eine neue, gemeinsame Seite zusammengesetzt, jede Seite bleibt
 * für sich. copyPages() kopiert die Seite 1:1 inkl. Rotation/Boxen, also
 * ohne die Rotationsbehandlung, die für das Nebeneinander-Werkzeug nötig war.
 */
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";

/** Referenz auf eine Seite: dateiIndex = Index in der `dateien`-Liste (0-
 *  basiert), seite = Seitenzahl innerhalb dieser Datei (1-basiert, wie im UI). */
export type SeitenRef = { dateiIndex: number; seite: number };

export async function seitenNeuZusammenstellen(
  dateien: Uint8Array[],
  reihenfolge: SeitenRef[],
): Promise<Uint8Array> {
  if (dateien.length === 0) throw new Error("Keine Datei übergeben.");
  if (reihenfolge.length === 0) throw new Error("Keine Seite ausgewählt.");

  const docs = await Promise.all(dateien.map((b) => PDFDocument.load(b)));

  for (const ref of reihenfolge) {
    const doc = docs[ref.dateiIndex];
    if (!doc) throw new Error(`Datei-Index ${ref.dateiIndex} existiert nicht.`);
    const pageCount = doc.getPageCount();
    if (!Number.isInteger(ref.seite) || ref.seite < 1 || ref.seite > pageCount) {
      throw new Error(`Seite ${ref.seite} liegt außerhalb von 1-${pageCount} (Datei ${ref.dateiIndex}).`);
    }
  }

  const out = await PDFDocument.create();
  for (const ref of reihenfolge) {
    const [page] = await out.copyPages(docs[ref.dateiIndex], [ref.seite - 1]);
    out.addPage(page);
  }

  return out.save();
}

/** Mehrere PDFs komplett hintereinander zusammenführen (alle Seiten, in
 *  Datei-Reihenfolge) - für "alle Dateien eines Kapitels zu einer Druck-PDF
 *  zusammenfügen" statt Seiten einzeln auszuwählen. */
export async function dateienZusammenfuehren(dateien: Uint8Array[]): Promise<Uint8Array> {
  if (dateien.length === 0) throw new Error("Keine Datei übergeben.");
  const out = await PDFDocument.create();
  for (const bytes of dateien) {
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}

const PT_PRO_MM = 72 / 25.4;

/**
 * Kennung senkrecht (von unten nach oben lesend) am linken Seitenrand
 * einstempeln - zur Kontrolle bei Druck/Stanzung bei flux. Anker 7 mm
 * vom linken Rand, Schrifthöhe 4 mm, sodass 3 mm Sicherheitsabstand zur
 * Blattkante bleiben; Start an der unteren Kante.
 */
export async function kennungStempeln(pdfBytes: Uint8Array, text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 4 * PT_PRO_MM;
  const x = 7 * PT_PRO_MM;
  for (const page of doc.getPages()) {
    page.drawText(text, { x, y: 0, size: fontSize, font, rotate: degrees(90) });
  }
  return doc.save();
}
