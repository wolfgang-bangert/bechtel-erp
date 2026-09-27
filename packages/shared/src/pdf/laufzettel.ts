/**
 * Laufzettel: werk-generierter Produktions-Begleitzettel je Auftrag - ergänzt
 * die "Auftragslauftasche" (jobSheet), die 1:1 vom Portal kommt und der
 * Materialliste/Arbeitsvorgänge/Wire-O-Angaben fehlen. Reine Funktion, kein
 * Supabase-Zugriff (Muster wie dateienZusammenfuehren/resolveOne) - die
 * aufrufende Server Action lädt alle Daten vorher.
 *
 * pdf-lib hat kein Auto-Layout (kein Flexbox/Tabellen) - die y-Position wird
 * hier von Hand runtergezählt, bei Platzmangel wird eine neue Seite begonnen.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { spiralHex } from "../druck/spiralfarbe";

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN = 18 * MM;

export type LaufzettelMaterialZeile = {
  rolle: string | null;
  verwendung: string | null;
  material: string;
  menge: string;
};

export type LaufzettelVorgang = {
  typ: string;
  bauteil: string;
  papier: string | null;
  durchmesser: string | null;
  teilung: string | null;
  schlaufen: number | null;
  schlaufen_gesamt: number | null;
  spiralfarbe: string | null;
  status: string;
};

export type LaufzettelDurchmesserStufe = {
  zoll: string | null;
  mm: number | null;
  bezeichnung: string | null;
};

export type LaufzettelInput = {
  auftrag: {
    referenz: string;
    produkt: string;
    menge: number | null;
    liefertermin: string | null;
  };
  materialliste: LaufzettelMaterialZeile[];
  arbeitsvorgaenge: LaufzettelVorgang[];
  /** je teilung ("3:1"/"2:1") aufsteigend nach mm sortiert. */
  durchmesserSkala: Record<string, LaufzettelDurchmesserStufe[]>;
};

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Layout-Zustand: aktuelle Seite + y-Position, kapselt den Seitenumbruch. */
class Layout {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  ensure(space: number) {
    if (this.y - space < MARGIN) {
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.y = PAGE_H - MARGIN;
    }
  }

  text(s: string, x: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    this.page.drawText(s, {
      x,
      y: this.y,
      size,
      font: opts.bold ? this.bold : this.font,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });
  }

  hr() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    });
  }
}

export async function erzeugeLaufzettelPdf(input: LaufzettelInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = new Layout(doc, font, bold);

  // ---- Kopf: die Kernangaben groß und fett ---------------------------------
  L.text(`Laufzettel ${input.auftrag.referenz}`, MARGIN, 20, { bold: true });
  L.y -= 26;
  L.text(input.auftrag.produkt, MARGIN, 13, { bold: true });
  L.y -= 18;
  L.text(
    [
      input.auftrag.menge != null ? `Menge: ${input.auftrag.menge.toLocaleString("de-DE")}` : null,
      input.auftrag.liefertermin ? `Liefertermin: ${input.auftrag.liefertermin}` : null,
    ]
      .filter(Boolean)
      .join("   ·   "),
    MARGIN,
    11,
  );
  L.y -= 22;
  L.hr();
  L.y -= 20;

  // ---- Materialliste --------------------------------------------------------
  L.text("Materialliste", MARGIN, 14, { bold: true });
  L.y -= 20;
  if (input.materialliste.length === 0) {
    L.text("— keine Materialregel hat gegriffen —", MARGIN, 10);
    L.y -= 16;
  }
  for (const m of input.materialliste) {
    L.ensure(16);
    const rolle = [m.rolle, m.verwendung].filter(Boolean).join(" · ") || "?";
    L.text(rolle, MARGIN, 9.5, { color: rgb(0.4, 0.4, 0.4) });
    L.text(m.material, MARGIN + 150, 10.5);
    L.text(m.menge, PAGE_W - MARGIN - 90, 10.5);
    L.y -= 16;
  }
  L.y -= 10;
  L.hr();
  L.y -= 20;

  // ---- Arbeitsvorgänge --------------------------------------------------------
  L.text("Arbeitsvorgänge", MARGIN, 14, { bold: true });
  L.y -= 20;
  for (const v of input.arbeitsvorgaenge) {
    L.ensure(46);
    L.text(`${v.typ} · ${v.bauteil}`, MARGIN, 11, { bold: true });
    L.text(v.status, PAGE_W - MARGIN - 80, 9.5, { color: rgb(0.4, 0.4, 0.4) });
    L.y -= 16;

    // Papier soll ins Auge stechen: fett und größer als der Rest.
    if (v.papier) {
      L.text(v.papier, MARGIN + 10, 12, { bold: true });
      L.y -= 17;
    }

    // Wire-O: Spiralfarbe als echtes Farbmuster + Durchmesser auf der
    // abgestuften Skala (wire_o_durchmesser) markiert.
    if (v.teilung || v.durchmesser) {
      const loops = [
        v.schlaufen != null ? `${v.schlaufen} Loops/Expl.` : null,
        v.schlaufen_gesamt != null ? `${v.schlaufen_gesamt.toLocaleString("de-DE")} gesamt` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      L.text(`Teilung ${v.teilung ?? "—"}   ${loops}`, MARGIN + 10, 11, { bold: true });

      if (v.spiralfarbe) {
        const sw = 10;
        const sx = MARGIN + 260;
        L.page.drawRectangle({
          x: sx,
          y: L.y - 1,
          width: sw,
          height: sw,
          color: hexToRgb(spiralHex(v.spiralfarbe)),
          borderColor: rgb(0.5, 0.5, 0.5),
          borderWidth: 0.5,
        });
        L.text(v.spiralfarbe, sx + sw + 5, 10.5);
      }
      L.y -= 18;

      const stufen = (v.teilung && input.durchmesserSkala[v.teilung]) || [];
      if (stufen.length > 0) {
        const boxW = 22;
        const gap = 4;
        let x = MARGIN + 10;
        for (const s of stufen) {
          const aktiv = s.zoll === v.durchmesser || s.bezeichnung === v.durchmesser;
          L.page.drawRectangle({
            x,
            y: L.y - 12,
            width: boxW,
            height: 14,
            color: aktiv ? rgb(0.18, 0.44, 0.92) : rgb(1, 1, 1),
            borderColor: rgb(0.6, 0.6, 0.6),
            borderWidth: 0.6,
          });
          L.page.drawText(s.zoll ?? (s.mm != null ? `${s.mm}` : "?"), {
            x: x + 2,
            y: L.y - 9,
            size: 6.5,
            font: aktiv ? bold : font,
            color: aktiv ? rgb(1, 1, 1) : rgb(0.3, 0.3, 0.3),
          });
          x += boxW + gap;
        }
        L.y -= 24;
      }
    }
    L.y -= 8;
    L.hr();
    L.y -= 16;
  }

  return doc.save();
}
