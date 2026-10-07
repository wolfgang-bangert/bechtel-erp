/**
 * Aufstellung der Wochen-Abrechnung (Anlage zur Sammelrechnung Onlineprinters):
 * je Woche alle Aufträge mit Listenpreis, abgerechnetem Betrag und Begründung
 * (z.B. Teil-Reklamation). Reine Funktion (pdf-lib), kein Supabase-Zugriff -
 * die aufrufende Stelle lädt die Daten. A4 quer, Seitenumbruch mit Kopfzeile.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const MM = 72 / 25.4;
const PAGE_W = 297 * MM;
const PAGE_H = 210 * MM;
const MARGIN = 14 * MM;

export type AufstellungPosition = {
  referenz: string | null;
  bezeichnung: string | null;
  merkmale: string | null;
  versand_datum: string | null; // YYYY-MM-DD
  listenpreis: number | null;
  betrag: number;
  begruendung: string | null;
};

export type AufstellungWoche = {
  jahr: number;
  kw: number;
  von: string;
  bis: string;
  positionen: AufstellungPosition[];
};

export type AufstellungInput = {
  absenderName: string;
  empfaengerName: string;
  /** gesetzt → "Aufstellung zur Rechnung …"; sonst Überschrift je nach Vorschau */
  rechnungsnummer?: string | null;
  /** Wochen-Abrechnung noch nicht festgeschrieben */
  vorschau?: boolean;
  wochen: AufstellungWoche[];
};

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const datumDe = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "");
const runden = (n: number) => Math.round(n * 100) / 100;

/** Helvetica (WinAnsi) kann nicht alles - nicht darstellbare Zeichen ersetzen statt abzustürzen. */
function sicher(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text.replace(/\s+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function umbrechen(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const zeilen: string[] = [];
  let aktuell = "";
  const push = () => {
    if (aktuell) zeilen.push(aktuell);
    aktuell = "";
  };
  for (const wort of sicher(text, font).split(" ")) {
    if (!wort) continue;
    let w = wort;
    // überlanges Wort hart trennen
    while (font.widthOfTextAtSize(w, size) > maxW) {
      let n = w.length;
      while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > maxW) n--;
      push();
      zeilen.push(w.slice(0, n));
      w = w.slice(n);
    }
    const probe = aktuell ? `${aktuell} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) <= maxW) aktuell = probe;
    else {
      push();
      aktuell = w;
    }
  }
  push();
  return zeilen.length ? zeilen : [""];
}

export async function erzeugeAufstellungPdf(input: AufstellungInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.17, 0.17, 0.17);
  const muted = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.85, 0.85, 0.85);
  const warn = rgb(0.7, 0.15, 0.15);

  // Spalten (x-Start in pt)
  const cAuftrag = MARGIN;
  const cBez = cAuftrag + 34 * MM;
  const cListe = cBez + 92 * MM; // rechtsbündig bis cListe + 24mm
  const cBetrag = cListe + 26 * MM; // rechtsbündig
  const cGrund = cBetrag + 28 * MM;
  const wAuftrag = 32 * MM;
  const wBez = 88 * MM;
  const wZahl = 24 * MM;
  const wGrund = PAGE_W - MARGIN - cGrund;

  let page!: PDFPage;
  let y = 0;
  const titel = input.rechnungsnummer
    ? `Aufstellung zur Rechnung ${input.rechnungsnummer}`
    : input.wochen.length === 1
      ? `Aufstellung Wochen-Abrechnung KW ${input.wochen[0].kw}/${input.wochen[0].jahr}`
      : "Aufstellung Wochen-Abrechnung";

  const text = (t: string, x: number, size = 9, f = font, color = ink) =>
    page.drawText(sicher(t, f), { x, y, size, font: f, color });
  const rechts = (t: string, xRechts: number, size = 9, f = font, color = ink) => {
    const s = sicher(t, f);
    page.drawText(s, { x: xRechts - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  };

  const tabellenKopf = () => {
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_W - MARGIN, y: y + 4 }, thickness: 0.6, color: line });
    y -= 4 * MM;
    text("Auftrag / Versand", cAuftrag, 8, bold, muted);
    text("Bezeichnung", cBez, 8, bold, muted);
    rechts("Listenpreis", cListe + wZahl, 8, bold, muted);
    rechts("Betrag netto", cBetrag + wZahl, 8, bold, muted);
    text("Begründung", cGrund, 8, bold, muted);
    y -= 2.5 * MM;
    page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: PAGE_W - MARGIN, y: y + 1 }, thickness: 0.4, color: line });
    y -= 4 * MM;
  };

  const neueSeite = (wocheTitel?: string) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    text(`${input.absenderName}  ·  an ${input.empfaengerName}`, MARGIN, 8, font, muted);
    y -= 7 * MM;
    text(titel, MARGIN, 14, bold);
    if (input.vorschau && !input.rechnungsnummer) {
      rechts("VORSCHAU – noch nicht festgeschrieben", PAGE_W - MARGIN, 9, bold, warn);
    }
    y -= 7 * MM;
    if (wocheTitel) {
      text(wocheTitel, MARGIN, 10, bold);
      y -= 5 * MM;
    }
    tabellenKopf();
  };

  const platzBis = MARGIN + 8 * MM;
  let gesamtListe = 0;
  let gesamtBetrag = 0;

  for (const w of input.wochen) {
    const wocheTitel = `KW ${w.kw}/${w.jahr}  ·  Versand ${datumDe(w.von)} – ${datumDe(w.bis)}  ·  ${w.positionen.length} Aufträge`;
    if (!page || y < platzBis + 30 * MM) neueSeite(wocheTitel);
    else {
      y -= 3 * MM;
      text(wocheTitel, MARGIN, 10, bold);
      y -= 5 * MM;
      tabellenKopf();
    }

    let summeListe = 0;
    let summeBetrag = 0;
    for (const p of w.positionen) {
      const bezZeilen = umbrechen(p.bezeichnung ?? "", font, 8.5, wBez);
      const merkZeilen = p.merkmale ? umbrechen(p.merkmale, font, 7.5, wBez) : [];
      const grundZeilen = p.begruendung ? umbrechen(p.begruendung, font, 8.5, wGrund) : [];
      const hoehe = Math.max(bezZeilen.length * 3.6 + merkZeilen.length * 3.2, grundZeilen.length * 3.6, 7) * MM + 3 * MM;
      if (y - hoehe < platzBis) neueSeite(wocheTitel + " (Fortsetzung)");

      const geaendert = p.listenpreis != null ? Math.abs(p.betrag - p.listenpreis) > 0.004 : p.betrag !== 0;
      const top = y;
      text(p.referenz ?? "—", cAuftrag, 8.5, bold);
      y -= 3.4 * MM;
      if (p.versand_datum) text(datumDe(p.versand_datum), cAuftrag, 7.5, font, muted);
      y = top;
      for (const z of bezZeilen) {
        text(z, cBez, 8.5);
        y -= 3.6 * MM;
      }
      for (const z of merkZeilen) {
        text(z, cBez, 7.5, font, muted);
        y -= 3.2 * MM;
      }
      const ende = y;
      y = top;
      rechts(p.listenpreis != null ? eur(p.listenpreis) : "—", cListe + wZahl, 8.5, font, muted);
      rechts(eur(p.betrag), cBetrag + wZahl, 8.5, geaendert ? bold : font, geaendert ? warn : ink);
      for (const z of grundZeilen) {
        text(z, cGrund, 8.5);
        y -= 3.6 * MM;
      }
      y = Math.min(ende, top - 7 * MM, y) - 0.5 * MM;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.3, color: line });
      y -= 3.8 * MM;

      summeListe += p.listenpreis ?? 0;
      summeBetrag += p.betrag;
    }

    if (y < platzBis) neueSeite(wocheTitel + " (Fortsetzung)");
    y -= 2 * MM;
    text(`Summe KW ${w.kw}/${w.jahr}`, cBez, 9, bold);
    rechts(eur(runden(summeListe)), cListe + wZahl, 9, font, muted);
    rechts(eur(runden(summeBetrag)), cBetrag + wZahl, 9, bold);
    y -= 6 * MM;
    gesamtListe += summeListe;
    gesamtBetrag += summeBetrag;
  }

  if (input.wochen.length > 1) {
    if (y < platzBis + 8 * MM) neueSeite();
    text("Gesamtsumme netto", cBez, 10, bold);
    rechts(eur(runden(gesamtListe)), cListe + wZahl, 9, font, muted);
    rechts(eur(runden(gesamtBetrag)), cBetrag + wZahl, 10, bold);
  }

  // Seitenzahlen
  const seiten = doc.getPages();
  seiten.forEach((s, i) => {
    const t = `Seite ${i + 1} von ${seiten.length}`;
    s.drawText(t, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(t, 8), y: MARGIN / 2, size: 8, font, color: muted });
  });
  if (!seiten.length) neueSeite();

  return doc.save();
}

/** Hängt alle Seiten von `anhang` hinten an `basis` an (Rechnung + Aufstellung). */
export async function pdfAnhaengen(basis: Uint8Array, anhang: Uint8Array): Promise<Uint8Array> {
  const ziel = await PDFDocument.load(basis);
  const quelle = await PDFDocument.load(anhang);
  const seiten = await ziel.copyPages(quelle, quelle.getPageIndices());
  for (const s of seiten) ziel.addPage(s);
  return ziel.save();
}
