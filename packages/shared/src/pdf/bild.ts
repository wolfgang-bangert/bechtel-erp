import { PDFDocument } from "pdf-lib";

/** PNG/JPEG (z.B. Screenshot einer Rechnung) als einseitiges PDF verpacken - Seite im Bildformat, max. 1000 Punkte Kantenlänge. */
export async function bildZuPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const img = /png/i.test(mime) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
  const w = img.width * scale;
  const h = img.height * scale;
  const page = doc.addPage([w, h]);
  page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  return doc.save();
}
