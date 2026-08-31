import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { env } from "./env";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { getObjectBytes } from "./storage";
import { N_COLS, amount, ddmm, clean, q, raw, buildFile } from "./datevCommon";

type Options = {
  from: string;
  to: string;
  dryRun?: boolean;
  withDocuments?: boolean;
  /** zusätzlich noch nicht geprüfte Belege einbeziehen (nur für Tests/Vorschau). */
  includeExtracted?: boolean;
};

type Alloc = { amount: number | null; cost_center_id: string | null };
type Item = {
  net_amount: number | null;
  tax_rate: number | null;
  ledger_account: string | null;
  tax_code_id: string | null;
  cost_center_id: string | null;
  incoming_document_allocation: Alloc[];
};
type Doc = {
  id: string;
  doc_type: string;
  status: string;
  doc_number: string | null;
  doc_date: string | null;
  net_amount: number | null;
  tax_amount: number | null;
  gross_amount: number | null;
  tax_breakdown: Record<string, number> | null;
  ledger_account: string | null;
  tax_code_id: string | null;
  cost_center_id: string | null;
  pdf_storage_key: string | null;
  file_name: string | null;
  supplier_name: string | null;
  organization: { supplier_number: string | null } | null;
  incoming_document_item: Item[];
};

type Unit = { net: number; konto: string; rate: number; taxKey: string; kost: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

function docRate(d: Doc): number {
  const tb = d.tax_breakdown ?? {};
  const keys = Object.keys(tb);
  if (keys.length) return Math.round(Number(keys.sort((a, b) => (tb[b] ?? 0) - (tb[a] ?? 0))[0]));
  const net = d.net_amount ?? 0;
  return net > 0 && (d.tax_amount ?? 0) > 0 ? Math.round(((d.tax_amount ?? 0) / net) * 100) : 0;
}

export async function exportDatevKreditor(opts: Options) {
  const { from, to, dryRun = false, withDocuments = true, includeExtracted = false } = opts;
  const statuses = includeExtracted ? ["extracted", "reviewed", "booked"] : ["reviewed", "booked"];

  const taxKeyById = new Map(
    (
      await pagedSelect<{ id: string; datev_tax_key: string | null }>(
        "tax_code",
        "id, datev_tax_key",
      )
    ).map((t) => [t.id, (t.datev_tax_key ?? "").trim()]),
  );
  const kostById = new Map(
    (await pagedSelect<{ id: string; number: string }>("cost_center", "id, number")).map((c) => [
      c.id,
      c.number,
    ]),
  );

  const docs: Doc[] = [];
  const size = 500;
  let fromRow = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("incoming_document")
      .select(
        "id, doc_type, status, doc_number, doc_date, net_amount, tax_amount, gross_amount, tax_breakdown, " +
          "ledger_account, tax_code_id, cost_center_id, pdf_storage_key, file_name, supplier_name, " +
          "organization:supplier_organization_id ( supplier_number ), " +
          "incoming_document_item ( net_amount, tax_rate, ledger_account, tax_code_id, cost_center_id, " +
          "incoming_document_allocation ( amount, cost_center_id ) )",
      )
      .gte("doc_date", from)
      .lte("doc_date", to)
      .in("doc_type", ["invoice", "credit_note"])
      .in("status", statuses)
      .order("doc_date")
      .range(fromRow, fromRow + size - 1);
    if (error) throw new Error(`incoming_document lesen: ${error.message}`);
    docs.push(...((data ?? []) as unknown as Doc[]));
    if (!data || data.length < size) break;
    fromRow += size;
  }

  const personenkontoLen = env.datev.sachkontoLen() + 1;
  const kreMin = 7 * 10 ** (personenkontoLen - 1); // 70000
  const kreMax = 10 ** personenkontoLen - 1; // 99999

  const dataLines: string[] = [];
  const exportedIds: string[] = [];
  const pdfDocs: { key: string; name: string }[] = [];
  const skips = { noReviewed: 0, noKreditor: 0, badKreditor: 0, noKonto: 0, noBeleg: 0 };
  let grossTotal = 0;

  for (const d of docs) {
    if (!d.doc_date || !d.doc_number?.trim()) {
      skips.noBeleg += 1;
      continue;
    }
    const kreditor = d.organization?.supplier_number?.trim() ?? "";
    if (!kreditor) {
      skips.noKreditor += 1;
      continue;
    }
    if (!/^\d+$/.test(kreditor) || Number(kreditor) < kreMin || Number(kreditor) > kreMax) {
      skips.badKreditor += 1;
      continue;
    }

    const dRate = docRate(d);
    const dKonto = d.ledger_account?.trim() ?? "";
    const dTaxKey = taxKeyById.get(d.tax_code_id ?? "") ?? "";
    const dKost = kostById.get(d.cost_center_id ?? "") ?? "";

    // Buchungs-Einheiten aus Positionen + Aufteilungen bilden
    const units: Unit[] = [];
    const items = d.incoming_document_item ?? [];
    if (items.length) {
      for (const it of items) {
        const konto = it.ledger_account?.trim() || dKonto;
        const rate = it.tax_rate != null ? Math.round(Number(it.tax_rate)) : dRate;
        const taxKey = taxKeyById.get(it.tax_code_id ?? "") || dTaxKey;
        const baseKost = kostById.get(it.cost_center_id ?? "") || dKost;
        const net = it.net_amount ?? 0;
        const allocs = (it.incoming_document_allocation ?? []).filter((a) => (a.amount ?? 0) !== 0);
        if (allocs.length) {
          let used = 0;
          for (const a of allocs) {
            const amt = a.amount ?? 0;
            used += amt;
            units.push({
              net: amt,
              konto,
              rate,
              taxKey,
              kost: kostById.get(a.cost_center_id ?? "") || baseKost,
            });
          }
          const rest = r2(net - used);
          if (Math.abs(rest) >= 0.01) units.push({ net: rest, konto, rate, taxKey, kost: baseKost });
        } else {
          units.push({ net, konto, rate, taxKey, kost: baseKost });
        }
      }
    } else {
      units.push({ net: d.net_amount ?? 0, konto: dKonto, rate: dRate, taxKey: dTaxKey, kost: dKost });
    }

    if (units.some((u) => !u.konto)) {
      skips.noKonto += 1;
      continue;
    }

    // gleiche (Konto, Steuerschlüssel, KOST, Satz) zusammenfassen, brutto rechnen
    const agg = new Map<string, Unit & { gross: number }>();
    for (const u of units) {
      const vst = r2(u.net * (u.rate / 100));
      const gross = r2(u.net + vst);
      const k = `${u.konto}|${u.taxKey}|${u.kost}|${u.rate}`;
      const cur = agg.get(k);
      if (cur) cur.gross = r2(cur.gross + gross);
      else agg.set(k, { ...u, gross });
    }
    let lines = [...agg.values()].filter((u) => Math.abs(u.gross) >= 0.005);
    // Rundungsdifferenz zum Rechnungs-Brutto auf die größte Zeile
    const sum = r2(lines.reduce((s, u) => s + u.gross, 0));
    const target = d.gross_amount ?? sum;
    if (lines.length && Math.abs(sum - target) >= 0.01) {
      lines.sort((a, b) => b.gross - a.gross);
      lines[0].gross = r2(lines[0].gross + (target - sum));
    }

    const isCredit = d.doc_type === "credit_note";
    const sh = isCredit ? "H" : "S";
    const beleg = ddmm(d.doc_date);
    const num = clean(d.doc_number, 36);
    const text = clean(`${isCredit ? "GS" : "ER"} ${num} ${d.supplier_name ?? ""}`, 60);
    const pdfName = `${num.replace(/[^\w.-]+/g, "_") || d.id}.pdf`;

    for (const u of lines) {
      const cells = new Array<string>(N_COLS).fill("");
      cells[0] = raw(amount(u.gross)); // Umsatz brutto
      cells[1] = q(sh);
      cells[2] = q("EUR");
      cells[6] = raw(u.konto); // Konto = Aufwandskonto
      cells[7] = raw(kreditor); // Gegenkonto = Kreditor
      cells[8] = u.taxKey ? raw(u.taxKey) : ""; // BU-Schlüssel (Vorsteuer), sonst leer = Automatik
      cells[9] = raw(beleg);
      cells[10] = q(num);
      cells[13] = q(text);
      if (d.pdf_storage_key) {
        cells[20] = q("Belegname");
        cells[21] = q(pdfName);
      }
      cells[36] = u.kost ? raw(u.kost) : ""; // KOST1
      dataLines.push(cells.join(";"));
      grossTotal += isCredit ? -u.gross : u.gross;
    }
    exportedIds.push(d.id);
    if (d.pdf_storage_key) pdfDocs.push({ key: d.pdf_storage_key, name: pdfName });
  }

  const skipped = skips.noReviewed + skips.noKreditor + skips.badKreditor + skips.noKonto + skips.noBeleg;
  const buf = buildFile(dataLines, from, to, `Rechnungseingang ${from} bis ${to}`);
  const sha = createHash("sha256").update(buf).digest("hex");
  const csvName = `EXTF_Kreditoren_${from}_${to}.csv`;

  const dir = fileURLToPath(new URL("../../../reports/datev/", import.meta.url));
  mkdirSync(dir, { recursive: true });

  let zipName: string | null = null;
  let zipBytes = 0;
  if (withDocuments && !dryRun && dataLines.length) {
    const zip = new JSZip();
    zip.file(csvName, buf);
    let added = 0;
    for (const p of pdfDocs) {
      try {
        zip.file(`belege/${p.name}`, await getObjectBytes(p.key));
        added += 1;
      } catch {
        /* PDF fehlt → ohne Beleg buchen */
      }
    }
    const zbuf = await zip.generateAsync({ type: "nodebuffer" });
    zipName = `DATEV_Kreditoren_${from}_${to}.zip`;
    writeFileSync(dir + zipName, zbuf);
    zipBytes = zbuf.length;
    pdfDocs.length = added; // für den Rückgabewert
  }
  if (!dryRun) writeFileSync(dir + csvName, buf);

  if (!dryRun && !includeExtracted && dataLines.length) {
    const { data: exp, error } = await supabase
      .from("datev_export")
      .insert({
        kind: "buchungsstapel",
        format: "EXTF",
        scope: "kreditor",
        period_start: from,
        period_end: to,
        row_count: dataLines.length,
        gross_total: r2(grossTotal),
        skipped_count: skipped,
        file_name: zipName ?? csvName,
        file_sha256: sha,
        file_bytes: zipBytes || buf.length,
      })
      .select("id")
      .single();
    if (error) throw new Error(`datev_export: ${error.message}`);
    for (let i = 0; i < exportedIds.length; i += 500) {
      const part = exportedIds.slice(i, i + 500).map((sid) => ({
        datev_export_id: (exp as { id: string }).id,
        source_table: "incoming_document",
        source_id: sid,
      }));
      const { error: e2 } = await supabase.from("datev_export_line").insert(part);
      if (e2) throw new Error(`datev_export_line: ${e2.message}`);
    }
    for (let i = 0; i < exportedIds.length; i += 500) {
      await supabase
        .from("incoming_document")
        .update({ status: "exported" })
        .in("id", exportedIds.slice(i, i + 500));
    }
  }

  return {
    docs: docs.length,
    booked: exportedIds.length,
    lines: dataLines.length,
    belege: pdfDocs.length,
    skipped,
    skips,
    grossTotal: r2(grossTotal),
    csv: dryRun ? "(dry-run)" : dir + csvName,
    zip: zipName ? dir + zipName : null,
    sha256: sha,
  };
}
