import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./env";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";

/* --------------------------------------------------------------------------
 * DATEV EXTF-Buchungsstapel (Ausgangsrechnungen / Debitoren) aus sales_invoice.
 * Erlöskonten-Zuordnung über setting 'datev.revenue_accounts'.
 * BU-Schlüssel bleibt leer (SKR03-Automatikkonten) — vom Steuerberater bestätigen.
 * -------------------------------------------------------------------------- */

type Options = { from: string; to: string; dryRun?: boolean };

const EU = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

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

type RevMap = Record<string, string>;

function revenueAccount(
  rate: number,
  taxCountry: string,
  map: RevMap,
): string {
  if (rate >= 18) return map.standard_19;
  if (rate >= 6 && rate < 8) return map.standard_7;
  // rate ~0
  const c = (taxCountry || "DE").toUpperCase();
  if (c === "DE") return map.tax_free_other ?? map.fallback;
  if (EU.has(c)) return map.reverse_charge_eu ?? map.fallback;
  return map.export_third_country ?? map.fallback;
}

type Inv = {
  id: string;
  external_id: string | null;
  kind: string;
  invoice_number: string | null;
  invoice_date: string | null;
  net_total: number | null;
  tax_total: number | null;
  gross_total: number | null;
  tax_breakdown: Record<string, number> | null;
  organization: { name: string; customer_number: string | null; tax_country: string | null } | null;
};

/** [rate%, bruttoAnteil][] für eine Rechnung. */
function taxSplit(inv: Inv): [number, number][] {
  const gross = inv.gross_total ?? 0;
  const net = inv.net_total ?? 0;
  const tb = inv.tax_breakdown;
  if (tb && Object.keys(tb).length > 0) {
    const out: [number, number][] = [];
    for (const [rateStr, taxAmt] of Object.entries(tb)) {
      const rate = Math.round(Number(rateStr) * 100);
      const netPortion = rate > 0 ? taxAmt / (rate / 100) : 0;
      out.push([rate, Math.round((netPortion + taxAmt) * 100) / 100]);
    }
    // Rundungsdifferenz auf die größte Zeile
    const sum = out.reduce((s, [, g]) => s + g, 0);
    if (out.length && Math.abs(sum - gross) >= 0.01) {
      out.sort((a, b) => b[1] - a[1]);
      out[0][1] = Math.round((out[0][1] + (gross - sum)) * 100) / 100;
    }
    return out;
  }
  const rate =
    net > 0 && (inv.tax_total ?? 0) > 0
      ? Math.round(((inv.tax_total ?? 0) / net) * 100)
      : 0;
  return [[rate, gross]];
}

export async function exportDatevExtf(opts: Options) {
  const { from, to, dryRun = false } = opts;
  const map = (
    (
      await pagedSelect<{ key: string; value: RevMap }>("setting", "key, value")
    ).find((s) => s.key === "datev.revenue_accounts")?.value ?? {}
  ) as RevMap;
  if (!map.standard_19) throw new Error("setting datev.revenue_accounts fehlt/leer");

  const invoices: Inv[] = [];
  const size = 1000;
  let fromRow = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("sales_invoice")
      .select(
        "id, external_id, kind, invoice_number, invoice_date, net_total, tax_total, gross_total, tax_breakdown, organization:organization(name, customer_number, tax_country)",
      )
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .in("kind", ["invoice", "credit_note"])
      .order("invoice_date")
      .range(fromRow, fromRow + size - 1);
    if (error) throw new Error(`sales_invoice lesen: ${error.message}`);
    invoices.push(...((data ?? []) as unknown as Inv[]));
    if (!data || data.length < size) break;
    fromRow += size;
  }

  const personenkontoLen = env.datev.sachkontoLen() + 1;
  const debMin = 10 ** (personenkontoLen - 1); // z. B. 10000
  const debMax = 7 * 10 ** (personenkontoLen - 1) - 1; // z. B. 69999

  const dataLines: string[] = [];
  const sourceIds: string[] = [];
  const skips = { noNumber: 0, noDebitor: 0, badDebitor: 0 };
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

    const isCredit = inv.kind === "credit_note";
    const sh = isCredit ? "H" : "S";
    const beleg = ddmm(inv.invoice_date);
    const num = clean(inv.invoice_number, 36);
    const text = clean(`${isCredit ? "GS" : "RE"} ${num} ${org?.name ?? ""}`, 60);

    for (const [rate, grossPortion] of taxSplit(inv)) {
      if (Math.abs(grossPortion) < 0.005) continue;
      const konto = revenueAccount(rate, org?.tax_country ?? "DE", map);
      const cells = new Array<string>(N_COLS).fill("");
      cells[0] = raw(amount(grossPortion)); // Umsatz (Zahl, ohne Anführungszeichen)
      cells[1] = q(sh); // Soll/Haben-Kz
      cells[2] = q("EUR"); // WKZ Umsatz
      cells[6] = raw(debitor); // Konto = Debitor
      cells[7] = raw(konto); // Gegenkonto = Erlöskonto
      // cells[8] BU-Schlüssel: leer (SKR03-Automatikkonto)
      cells[9] = raw(beleg); // Belegdatum DDMM
      cells[10] = q(num); // Belegfeld 1 (Rechnungsnummer)
      cells[13] = q(text); // Buchungstext
      dataLines.push(cells.join(";"));
      grossTotal += isCredit ? -grossPortion : grossPortion;
    }
    sourceIds.push(inv.id);
  }
  const skipped = skips.noNumber + skips.noDebitor + skips.badDebitor;

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
