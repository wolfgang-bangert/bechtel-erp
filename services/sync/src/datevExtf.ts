import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./env";
import { supabase } from "./supabase";
import { generateInvoiceBooking } from "./syncInvoiceBookings";

/* --------------------------------------------------------------------------
 * DATEV EXTF-Buchungsstapel (Ausgangsrechnungen / Debitoren) aus sales_invoice.
 * Die Erlöskonto-Aufteilung kommt aus sales_invoice_booking (siehe
 * syncInvoiceBookings.ts) - dieselben Buchungszeilen, die auch auf der
 * Rechnung angezeigt werden, statt sie hier separat neu zu berechnen.
 * Für Rechnungen ohne bereits generierte Buchungszeilen wird hier einmalig
 * nachgezogen (generateInvoiceBooking), damit der Export nichts stillschweigend
 * überspringt.
 * BU-Schlüssel bleibt leer (SKR03-Automatikkonten) — vom Steuerberater bestätigen.
 * -------------------------------------------------------------------------- */

type Options = { from: string; to: string; dryRun?: boolean };

const HEADER_FIELDS = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs",
  "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto",
  "Buchungstext", "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank",
  "Sachverhalt", "Zinssperre", "Beleglink",
  "Beleginfo - Art 1", "Beleginfo - Inhalt 1", "Beleginfo - Art 2", "Beleginfo - Inhalt 2",
  "Beleginfo - Art 3", "Beleginfo - Inhalt 3", "Beleginfo - Art 4", "Beleginfo - Inhalt 4",
  "Beleginfo - Art 5", "Beleginfo - Inhalt 5", "Beleginfo - Art 6", "Beleginfo - Inhalt 6",
  "Beleginfo - Art 7", "Beleginfo - Inhalt 7", "Beleginfo - Art 8", "Beleginfo - Inhalt 8",
  "KOST1 - Kostenstelle", "KOST2 - Kostenstelle", "Kost-Menge",
  "EU-Land u. UStID (Bestimmung)", "EU-Steuersatz (Bestimmung)",
];
const N_COLS = HEADER_FIELDS.length;

const amount = (n: number) => Math.abs(n).toFixed(2).replace(".", ",");
const ddmm = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}`;
const yyyymmdd = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
const clean = (s: string, max: number) =>
  s.replace(/[";\r\n]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
/** DATEV: Text in Anführungszeichen, Zahlen/Datum ohne, Leeres bleibt leer. */
const q = (v: string) => (v === "" ? "" : `"${v.replace(/"/g, '""')}"`);
const raw = (v: string | number) => String(v);

type Booking = { ledger_account: string; gross_amount: number };
type Inv = {
  id: string;
  external_id: string | null;
  kind: string;
  invoice_number: string | null;
  invoice_date: string | null;
  organization: { name: string; customer_number: string | null } | null;
  bookings: Booking[];
};

export async function exportDatevExtf(opts: Options) {
  const { from, to, dryRun = false } = opts;

  const invoices: Inv[] = [];
  const size = 1000;
  let fromRow = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("sales_invoice")
      .select(
        "id, external_id, kind, invoice_number, invoice_date, " +
          "organization:organization(name, customer_number), " +
          "bookings:sales_invoice_booking(ledger_account, gross_amount)",
      )
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .eq("ohne_buchhaltung", false)
      .in("kind", ["invoice", "credit_note"])
      .order("invoice_date")
      .range(fromRow, fromRow + size - 1);
    if (error) throw new Error(`sales_invoice lesen: ${error.message}`);
    invoices.push(...((data ?? []) as unknown as Inv[]));
    if (!data || data.length < size) break;
    fromRow += size;
  }

  // Für Rechnungen ohne bereits generierte Buchungszeilen einmalig nachziehen,
  // damit der Export nichts stillschweigend überspringt - nicht im DRY RUN
  // (der darf nichts schreiben; fehlende Buchungszeilen zählen dort einfach
  // als "noBooking" übersprungen).
  const missingBooking = dryRun
    ? []
    : invoices.filter((inv) => inv.invoice_number?.trim() && inv.bookings.length === 0);
  for (const inv of missingBooking) {
    try {
      const r = await generateInvoiceBooking(inv.id);
      if (r.zeilen) {
        const { data: fresh } = await supabase
          .from("sales_invoice_booking")
          .select("ledger_account, gross_amount")
          .eq("sales_invoice_id", inv.id);
        inv.bookings = (fresh ?? []) as Booking[];
      }
    } catch {
      // bleibt ohne Buchungszeilen -> unten als noBooking übersprungen
    }
  }

  const personenkontoLen = env.datev.sachkontoLen() + 1;
  const debMin = 10 ** (personenkontoLen - 1); // z. B. 10000
  const debMax = 7 * 10 ** (personenkontoLen - 1) - 1; // z. B. 69999

  const dataLines: string[] = [];
  const sourceIds: string[] = [];
  const skips = { noNumber: 0, noDebitor: 0, badDebitor: 0, noBooking: 0 };
  let grossTotal = 0;

  for (const inv of invoices) {
    const org = inv.organization;
    if (!inv.invoice_date || !inv.invoice_number?.trim()) {
      skips.noNumber += 1; // Entwurf / nicht festgeschrieben
      continue;
    }
    const debitor = org?.customer_number?.trim() ?? "";
    if (!debitor) {
      skips.noDebitor += 1;
      continue;
    }
    if (!/^\d+$/.test(debitor) || Number(debitor) < debMin || Number(debitor) > debMax) {
      skips.badDebitor += 1;
      continue;
    }
    if (inv.bookings.length === 0) {
      skips.noBooking += 1; // Buchungszeilen konnten nicht erzeugt werden
      continue;
    }

    const isCredit = inv.kind === "credit_note";
    const sh = isCredit ? "H" : "S";
    const beleg = ddmm(inv.invoice_date);
    const num = clean(inv.invoice_number, 36);
    const text = clean(`${isCredit ? "GS" : "RE"} ${num} ${org?.name ?? ""}`, 60);

    for (const b of inv.bookings) {
      const grossPortion = b.gross_amount;
      if (Math.abs(grossPortion) < 0.005) continue;
      const cells = new Array<string>(N_COLS).fill("");
      cells[0] = raw(amount(grossPortion)); // Umsatz (Zahl, ohne Anführungszeichen)
      cells[1] = q(sh); // Soll/Haben-Kz
      cells[2] = q("EUR"); // WKZ Umsatz
      cells[6] = raw(debitor); // Konto = Debitor
      cells[7] = raw(b.ledger_account); // Gegenkonto = Erlöskonto
      // cells[8] BU-Schlüssel: leer (SKR03-Automatikkonto)
      cells[9] = raw(beleg); // Belegdatum DDMM
      cells[10] = q(num); // Belegfeld 1 (Rechnungsnummer)
      cells[13] = q(text); // Buchungstext
      dataLines.push(cells.join(";"));
      grossTotal += isCredit ? -grossPortion : grossPortion;
    }
    sourceIds.push(inv.id);
  }
  const skipped = skips.noNumber + skips.noDebitor + skips.badDebitor + skips.noBooking;

  const now = new Date();
  const ts =
    now.toISOString().replace(/[-:T]/g, "").slice(0, 14) +
    String(now.getMilliseconds()).padStart(3, "0");
  const wjYear = from.slice(0, 4);
  const wjBeginn = `${wjYear}${env.datev.wjBeginnDDMM()}`;
  const bezeichnung = `Rechnungsausgang ${from} bis ${to}`;

  const headerLine = [
    q("EXTF"), "700", "21", q("Buchungsstapel"), "13", raw(ts),
    "", "", "", "",
    raw(env.datev.beraterNr()), raw(env.datev.mandantenNr()),
    raw(wjBeginn), raw(env.datev.sachkontoLen()),
    raw(yyyymmdd(from)), raw(yyyymmdd(to)),
    q(bezeichnung), "", "1", "0", "0", q("EUR"),
    "", "", "", "0", "", "", "", "", "",
  ].join(";");

  const content =
    headerLine +
    "\r\n" +
    HEADER_FIELDS.join(";") +
    "\r\n" +
    dataLines.join("\r\n") +
    (dataLines.length ? "\r\n" : "");

  const buf = Buffer.from(content, "latin1");
  const sha = createHash("sha256").update(buf).digest("hex");
  const fileName = `EXTF_Buchungsstapel_${from}_${to}.csv`;

  const dir = fileURLToPath(new URL("../../../reports/datev/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const path = dir + fileName;
  if (!dryRun) writeFileSync(path, buf);

  if (!dryRun) {
    const { data: exp, error } = await supabase
      .from("datev_export")
      .insert({
        kind: "buchungsstapel",
        format: "EXTF",
        scope: "debitor",
        period_start: from,
        period_end: to,
        row_count: dataLines.length,
        gross_total: Math.round(grossTotal * 100) / 100,
        skipped_count: skipped,
        file_name: fileName,
        file_sha256: sha,
        file_bytes: buf.length,
      })
      .select("id")
      .single();
    if (error) throw new Error(`datev_export: ${error.message}`);
    for (let i = 0; i < sourceIds.length; i += 500) {
      const part = sourceIds.slice(i, i + 500).map((sid) => ({
        datev_export_id: (exp as { id: string }).id,
        source_table: "sales_invoice",
        source_id: sid,
      }));
      const { error: e2 } = await supabase.from("datev_export_line").insert(part);
      if (e2) throw new Error(`datev_export_line: ${e2.message}`);
    }
  }

  return {
    invoices: invoices.length,
    booked: sourceIds.length,
    lines: dataLines.length,
    skipped,
    skips,
    grossTotal: Math.round(grossTotal * 100) / 100,
    file: dryRun ? "(dry-run)" : path,
    sha256: sha,
  };
}
