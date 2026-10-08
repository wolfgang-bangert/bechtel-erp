/**
 * Rechnungs-PDF (werk-nativ, Basislayout) - Grundlage für die ZUGFeRD-
 * Einbettung (fakturierung/zugferd.ts). Reine Funktion, kein Supabase-Zugriff
 * (Muster wie pdf/laufzettel.ts) - die aufrufende Action lädt alle Daten
 * vorher. Schlankes einseitiges Dokument: wenige Positionen (eine je Woche
 * bei der Onlineprinters-Sammelrechnung), kein Vorlagen-Overengineering.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN = 20 * MM;

export type RechnungAbsender = {
  name: string;
  legal_name?: string | null;
  address?: { line1?: string | null; zip?: string | null; city?: string | null; country?: string | null } | null;
  vat_id?: string | null;
  tax_number?: string | null;
  bank?: { iban?: string | null; bic?: string | null; name?: string | null } | null;
};

export type RechnungEmpfaenger = {
  name: string;
  address?: { line1?: string | null; zip?: string | null; city?: string | null; country?: string | null } | null;
  vat_id?: string | null;
};

export type RechnungPosition = {
  description: string;
  net_amount: number;
};

export type RechnungInput = {
  absender: RechnungAbsender;
  empfaenger: RechnungEmpfaenger;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
  positionen: RechnungPosition[];
  net_total: number;
  tax_total: number;
  gross_total: number;
  tax_rate: number; // z.B. 19
};

const fmtEur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtDatumDe = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

export async function erzeugeRechnungPdf(input: RechnungInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.17, 0.17, 0.17);
  const muted = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.85, 0.85, 0.85);

  let y = PAGE_H - MARGIN;
  const left = MARGIN;
  const right = PAGE_W - MARGIN;

  const draw = (text: string, x: number, size = 10, f = font, color = ink) => {
    page.drawText(text, { x, y, size, font: f, color });
  };
  const drawRight = (text: string, size = 10, f = font, color = ink) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: right - w, y, size, font: f, color });
  };

  // Absender (klein, oben)
  const a = input.absender;
  const absenderZeile = [
    a.legal_name ?? a.name,
    a.address?.line1,
    [a.address?.zip, a.address?.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
  draw(absenderZeile, left, 8, font, muted);
  y -= 7 * MM;

  // Empfänger
  draw(input.empfaenger.name, left, 11, bold);
  y -= 5 * MM;
  if (input.empfaenger.address?.line1) {
    draw(input.empfaenger.address.line1, left, 10);
    y -= 5 * MM;
  }
  if (input.empfaenger.address?.zip || input.empfaenger.address?.city) {
    draw([input.empfaenger.address?.zip, input.empfaenger.address?.city].filter(Boolean).join(" "), left, 10);
    y -= 5 * MM;
  }

  y -= 12 * MM;
  draw("Rechnung", left, 18, bold);
  y -= 8 * MM;
  draw(`Rechnungsnummer: ${input.invoice_number}`, left, 10);
  drawRight(`Rechnungsdatum: ${fmtDatumDe(input.invoice_date)}`, 10);
  y -= 10 * MM;

  // Positionstabelle
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: line });
  y -= 6 * MM;
  draw("Beschreibung", left, 9, bold, muted);
  drawRight("Netto", 9, bold, muted);
  y -= 5 * MM;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 6 * MM;

  for (const p of input.positionen) {
    draw(p.description, left, 10);
    drawRight(fmtEur(p.net_amount), 10);
    y -= 6.5 * MM;
  }

  y -= 2 * MM;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 7 * MM;

  draw("Netto", left, 10, font, muted);
  drawRight(fmtEur(input.net_total), 10);
  y -= 5.5 * MM;
  draw(`USt. ${input.tax_rate.toFixed(0)} %`, left, 10, font, muted);
  drawRight(fmtEur(input.tax_total), 10);
  y -= 5.5 * MM;
  draw("Gesamtbetrag", left, 11, bold);
  drawRight(fmtEur(input.gross_total), 11, bold);
  y -= 14 * MM;

  // Zahlungshinweis
  if (a.bank?.iban) {
    draw("Zahlbar ohne Abzug.", left, 9, font, muted);
    y -= 5 * MM;
    draw(`${a.bank.name ? a.bank.name + "  ·  " : ""}IBAN ${a.bank.iban}${a.bank.bic ? "  ·  BIC " + a.bank.bic : ""}`, left, 9, font, muted);
    y -= 5 * MM;
  }

  // Fußzeile: Steuer-/Firmendaten
  const fussY = MARGIN;
  const fuss = [
    a.vat_id ? `USt-IdNr. ${a.vat_id}` : null,
    a.tax_number ? `Steuernr. ${a.tax_number}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (fuss) {
    page.drawText(fuss, { x: left, y: fussY, size: 7.5, font, color: muted });
  }

  return doc.save();
}
