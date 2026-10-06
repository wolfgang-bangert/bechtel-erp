/**
 * Prüfung, ob ein Eingangsbeleg "buchbar" ist: Konto und Steuerschlüssel überall gesetzt, Summen stimmig.
 * Gemeinsame Regel für die Sperre beim Buchen (Server) und die Anzeige (Liste, Detail).
 */

export type PruefPosition = {
  ledger_account: string | null;
  tax_code_id: string | null;
  linked_document_id: string | null;
  net_amount: number | null;
  tax_rate: number | null;
};

export type PruefBeleg = {
  ledger_account: string | null;
  tax_code_id: string | null;
  net_amount: number | null;
  tax_amount: number | null;
  gross_amount: number | null;
  /** extraction->_ust->>status: "vorschlag" = USt-Schlüssel noch nicht bestätigt */
  ust_status?: string | null;
  items: PruefPosition[];
};

/** Steuerschlüssel für die Satz-Prüfung: nur Inlandsschlüssel (19/7/0 %) werden gegen den Positionssatz geprüft. */
export type SchluesselInfo = Map<string, { code: string; rate: number; pruefen: boolean }>;

export function schluesselInfo(
  codes: { id: string; code: string; rate: number | null; treatment: string | null }[],
): SchluesselInfo {
  return new Map(
    codes.map((c) => [
      c.id,
      { code: c.code, rate: Number(c.rate ?? 0), pruefen: c.treatment === "standard_de" || c.treatment === "tax_free_other" },
    ]),
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function buchungsProbleme(d: PruefBeleg, opts: { ohneUst?: boolean; schluessel?: SchluesselInfo } = {}): string[] {
  const p: string[] = [];
  const pos = d.items.filter((i) => !i.linked_document_id);
  const net = Number(d.net_amount ?? 0);
  const tax = Number(d.tax_amount ?? 0);
  const gross = Number(d.gross_amount ?? 0);

  const kontoOk = pos.length ? pos.every((i) => i.ledger_account || d.ledger_account) : !!d.ledger_account;
  if (!kontoOk) p.push("Konto fehlt (Beleg oder Position)");
  const schluesselOk = pos.length ? pos.every((i) => i.tax_code_id) : !!d.tax_code_id;
  if (!schluesselOk) p.push("Steuerschlüssel fehlt (Beleg oder Position)");

  // Satz der Position muss zum Steuerschlüssel passen (nur Inlandsschlüssel; §13b/igE haben keinen Steuerbetrag)
  if (opts.schluessel) {
    const falsch = pos.filter((i) => {
      const k = i.tax_code_id ? opts.schluessel!.get(i.tax_code_id) : null;
      return k?.pruefen && i.tax_rate != null && Math.abs(Number(i.tax_rate) - k.rate) > 0.5;
    });
    if (falsch.length) {
      const k = opts.schluessel.get(falsch[0].tax_code_id!)!;
      p.push(
        `Steuersatz passt nicht zum Steuerschlüssel (${falsch.length} Position${falsch.length > 1 ? "en" : ""}, z. B. ${Number(falsch[0].tax_rate)} % bei ${k.code} = ${k.rate} %)`,
      );
    }
  }

  const kopf = r2(net + tax - gross);
  if (Math.abs(kopf) > 0.02) p.push(`Netto + USt ≠ Brutto (Differenz ${eur(kopf)})`);

  if (pos.length) {
    const summe = r2(pos.reduce((s, i) => s + Number(i.net_amount ?? 0), 0));
    if (Math.abs(Math.abs(summe) - Math.abs(net)) > 0.02)
      p.push(`Summe der Positionen (${eur(summe)}) ≠ Netto im Kopf (${eur(net)})`);
    // Vorsteuer aus Positionen x Satz gegen USt im Kopf (nur wenn der Beleg überhaupt USt ausweist; §13b/EU haben 0)
    if (Math.abs(tax) > 0.005 && pos.every((i) => i.tax_rate != null)) {
      const calc = r2(pos.reduce((s, i) => s + (Number(i.net_amount ?? 0) * Number(i.tax_rate)) / 100, 0));
      const tol = 0.02 + 0.01 * pos.length;
      if (Math.abs(Math.abs(calc) - Math.abs(tax)) > tol)
        p.push(`Steuer aus den Positionen (${eur(calc)}) ≠ USt im Kopf (${eur(tax)})`);
    }
  }
  if (!opts.ohneUst && d.ust_status === "vorschlag") p.push("USt-Schlüssel noch nicht bestätigt");
  return p;
}
