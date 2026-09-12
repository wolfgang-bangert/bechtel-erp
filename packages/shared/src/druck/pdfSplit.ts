/**
 * Eine 2-seitige Druckdaten-PDF (Umschlag + Inhalt in einer Datei, z. B. PBS
 * "4-farbig") in zwei einseitige PDFs trennen. Reine Byte-Verarbeitung, kein
 * Storage-Zugriff hier - Web und Worker laden/speichern jeweils selbst.
 *
 * Default: Seite 1 = Umschlag, Seite 2 = Inhalt (Standardfall, laut Praxis
 * ~90 % der Fälle). `tausch=true` dreht es um - manueller Schalter am
 * Auftrag, weil es sich nicht zuverlässig aus der PDF selbst erkennen lässt.
 */
import { PDFDocument } from "pdf-lib";

type Zeile = { rolle: string | null; bedruckt: boolean | null; einheit?: string };

/** Braucht dieser Auftrag die Umschlag/Inhalt-Trennung? Genau 2 gedruckte
 *  Zeilen, eine davon Deckblatt/Umschlag, eine etwas anderes. */
export function brauchtUmschlagInhaltTrennung(materialliste: Zeile[]): boolean {
  const druck = materialliste.filter(
    (z) => z.bedruckt !== false && (z.einheit === "bogen" || z.einheit === "blatt"),
  );
  if (druck.length !== 2) return false;
  const hatUmschlag = druck.some((z) => z.rolle === "Deckblatt");
  const hatInhalt = druck.some((z) => z.rolle !== "Deckblatt");
  return hatUmschlag && hatInhalt;
}

export async function splitUmschlagInhalt(
  bytes: Uint8Array,
  tausch: boolean,
): Promise<{ umschlag: Uint8Array; inhalt: Uint8Array }> {
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();
  if (pageCount < 2) {
    throw new Error(`PDF hat nur ${pageCount} Seite(n) - Trennung braucht mindestens 2`);
  }
  const [umschlagIdx, inhaltIdx] = tausch ? [1, 0] : [0, 1];

  const einzelseite = async (idx: number): Promise<Uint8Array> => {
    const doc = await PDFDocument.create();
    const [seite] = await doc.copyPages(src, [idx]);
    doc.addPage(seite);
    return doc.save();
  };

  const [umschlag, inhalt] = await Promise.all([einzelseite(umschlagIdx), einzelseite(inhaltIdx)]);
  return { umschlag, inhalt };
}
