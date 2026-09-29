import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { N_COLS, amount, ddmm, clean, q, raw, buildFile } from "./datevCommon";

type Options = { from: string; to: string; dryRun?: boolean };

type Match = {
  id: string;
  amount: number;
  bank_transaction_id: string;
  sales_invoice_id: string | null;
  incoming_document_id: string | null;
  ledger_account: string | null;
  kind: string | null;
  note: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * DATEV EXTF-Buchungsstapel für die Zahlungen (OP-Ausgleich):
 *  - Zahlungseingang:  Geldkonto  an  Debitor      (S/H = S)
 *  - Zahlungsausgang:  Geldkonto  an  Kreditor     (S/H = H)
 * Buchungszeilen mit Sachkonto (Skonto, Durchlaufende Posten, ...) werden
 * als eigene Geldkonto-<->Sachkonto-Zeile gebucht (Skonto zusätzlich mit
 * Debitor/Kreditor als Gegenkonto, wenn die Zeile einen Belegbezug hat -
 * das Sachkonto selbst steht bereits auf der Buchungszeile, keine
 * Neuberechnung/Ableitung hier nötig). Nur zugeordnete Bankbewegungen im
 * Zeitraum.
 */
export async function exportDatevZahlungen(opts: Options) {
  const { from, to, dryRun = false } = opts;

  const txns = await pagedSelect<{
    id: string;
    booking_date: string;
    bank_account_id: string;
    counterparty_name: string | null;
    amount: number;
  }>("bank_transaction", "id, booking_date, bank_account_id, counterparty_name, amount", undefined);
  const txById = new Map(txns.map((t) => [t.id, t]));

  const accounts = await pagedSelect<{ id: string; ledger_account: string | null; label: string }>(
    "bank_account",
    "id, ledger_account, label",
  );
  const geldkonto = new Map(accounts.map((a) => [a.id, a.ledger_account]));

  const matches = (await pagedSelect<Match>(
    "bank_transaction_match",
    "id, amount, bank_transaction_id, sales_invoice_id, incoming_document_id, ledger_account, kind, note",
  )).filter((m) => {
    const t = txById.get(m.bank_transaction_id);
    return t && t.booking_date >= from && t.booking_date <= to;
  });

  const siIds = matches.filter((m) => m.sales_invoice_id).map((m) => m.sales_invoice_id!);
  const idIds = matches.filter((m) => m.incoming_document_id).map((m) => m.incoming_document_id!);

  type SInv = {
    id: string;
    invoice_number: string | null;
    organization: { name: string | null; customer_number: string | null } | null;
  };
  type IDoc = {
    id: string;
    doc_number: string | null;
    supplier_name: string | null;
    organization: { supplier_number: string | null } | null;
  };
  const sInv = new Map<string, SInv>(
    (
      await pagedSelect<SInv>(
        "sales_invoice",
        "id, invoice_number, organization:organization(name, customer_number)",
      )
    )
      .filter((r) => siIds.includes(r.id))
      .map((r) => [r.id, r]),
  );
  const iDoc = new Map<string, IDoc>(
    (
      await pagedSelect<IDoc>(
        "incoming_document",
        "id, doc_number, supplier_name, organization:supplier_organization_id(supplier_number)",
      )
    )
      .filter((r) => idIds.includes(r.id))
      .map((r) => [r.id, r]),
  );

  const dataLines: string[] = [];
  const sourceIds: string[] = [];
  const skips = { noGeldkonto: 0, noPartnerNr: 0, noRgNr: 0, noTxn: 0 };
  let total = 0;

  for (const m of matches) {
    const tx = txById.get(m.bank_transaction_id);
    if (!tx) {
      skips.noTxn += 1;
      continue;
    }
    const konto = geldkonto.get(tx.bank_account_id);
    if (!konto) {
      skips.noGeldkonto += 1;
      continue;
    }
    // Debitor -> Geld rein; ohne Belegbezug (reine Sachkonto-Zeile, z.B.
    // Durchlaufende Posten) nach dem Vorzeichen der Bankzeile selbst.
    const isEingang = m.sales_invoice_id ? true : m.incoming_document_id ? false : tx.amount >= 0;
    let gegen = "";
    let rgnr = "";
    let partner = tx.counterparty_name ?? "";

    if (m.sales_invoice_id) {
      const inv = sInv.get(m.sales_invoice_id);
      gegen = inv?.organization?.customer_number?.trim() ?? "";
      rgnr = inv?.invoice_number?.trim() ?? "";
      partner = inv?.organization?.name ?? partner;
    } else if (m.incoming_document_id) {
      const doc = iDoc.get(m.incoming_document_id);
      gegen = doc?.organization?.supplier_number?.trim() ?? "";
      rgnr = doc?.doc_number?.trim() ?? "";
      partner = doc?.supplier_name ?? partner;
    }

    const betrag = Math.abs(r2(m.amount));
    if (betrag < 0.005) continue;
    const sh = isEingang ? "S" : "H"; // Konto = Geldkonto

    if (m.ledger_account) {
      // Sonderbuchung (Skonto, Durchlaufende Posten, Sonstiges): das
      // Sachkonto steht schon auf der Buchungszeile, keine Neuableitung
      // nötig. Mit Belegbezug (z.B. Skonto zu einer Rechnung) ist das
      // Sachkonto "Konto" und Debitor/Kreditor "Gegenkonto" (wie schon
      // bisher bei Skonto); ohne Belegbezug ist es Geldkonto an Sachkonto.
      const hatBeleg = Boolean(m.sales_invoice_id || m.incoming_document_id);
      if (hatBeleg && !/^\d{4,6}$/.test(gegen)) {
        skips.noPartnerNr += 1;
        continue;
      }
      const label =
        m.kind === "skonto" ? "Skonto" : m.kind === "doppelzahlung" ? "Durchlaufender Posten" : (m.note ?? "Sonderbuchung");
      const text = clean(`${label} ${rgnr} ${partner}`.trim(), 60);
      const cells = new Array<string>(N_COLS).fill("");
      cells[0] = raw(amount(betrag));
      cells[1] = q(sh);
      cells[2] = q("EUR");
      cells[6] = raw(hatBeleg ? m.ledger_account : konto);
      cells[7] = raw(hatBeleg ? gegen : m.ledger_account);
      cells[9] = raw(ddmm(tx.booking_date));
      cells[10] = q(clean(rgnr, 36));
      cells[13] = q(text);
      dataLines.push(cells.join(";"));
      sourceIds.push(m.id);
      total += isEingang ? betrag : -betrag;
      continue;
    }

    if (!/^\d{4,6}$/.test(gegen)) {
      skips.noPartnerNr += 1;
      continue;
    }
    if (!rgnr) {
      skips.noRgNr += 1;
      continue;
    }
    const text = clean(`${isEingang ? "Zahlungseingang" : "Zahlungsausgang"} ${rgnr} ${partner}`, 60);
    const cells = new Array<string>(N_COLS).fill("");
    cells[0] = raw(amount(betrag));
    cells[1] = q(sh);
    cells[2] = q("EUR");
    cells[6] = raw(konto); // Konto = Geldkonto
    cells[7] = raw(gegen); // Gegenkonto = Debitor/Kreditor
    cells[9] = raw(ddmm(tx.booking_date));
    cells[10] = q(clean(rgnr, 36));
    cells[13] = q(text);
    dataLines.push(cells.join(";"));
    sourceIds.push(m.id);
    total += isEingang ? betrag : -betrag;
  }

  const skipped = skips.noGeldkonto + skips.noPartnerNr + skips.noRgNr + skips.noTxn;
  const buf = buildFile(dataLines, from, to, `Zahlungen ${from} bis ${to}`);
  const sha = createHash("sha256").update(buf).digest("hex");
  const fileName = `EXTF_Zahlungen_${from}_${to}.csv`;
  const dir = fileURLToPath(new URL("../../../reports/datev/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  if (dataLines.length) writeFileSync(dir + fileName, buf); // Datei auch im Dry-Run (nur DB nicht)

  if (!dryRun && dataLines.length) {
    const { data: exp, error } = await supabase
      .from("datev_export")
      .insert({
        kind: "buchungsstapel",
        format: "EXTF",
        scope: "zahlungen",
        period_start: from,
        period_end: to,
        row_count: dataLines.length,
        gross_total: r2(total),
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
        source_table: "bank_transaction_match",
        source_id: sid,
      }));
      const { error: e2 } = await supabase.from("datev_export_line").insert(part);
      if (e2) throw new Error(`datev_export_line: ${e2.message}`);
    }
  }

  return {
    matches: matches.length,
    lines: dataLines.length,
    skipped,
    skips,
    saldo: r2(total),
    file: dataLines.length ? dir + fileName : "(leer)",
    sha256: sha,
  };
}
