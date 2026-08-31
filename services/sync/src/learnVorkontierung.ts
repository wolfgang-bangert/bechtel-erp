import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";

type Options = { dryRun?: boolean; minCount?: number; minConfidence?: number };

const importsPath = (n: string) => fileURLToPath(new URL(`../../../imports/${n}`, import.meta.url));

type BbPosting = {
  postingtext: string | null;
  amount: string | null;
  vat: string | null;
  tax_key: string | null;
  debit_postingaccount_number: string | null;
  credit_postingaccount_number: string | null;
  receipts_assigned_counterparties: string | null;
  date: string | null;
};

const topOf = (m: Map<string, number>): [string, number] =>
  [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

/**
 * Lernt aus imports/bb-buchungen.json je Lieferant (Kreditorkonto) das am
 * häufigsten bebuchte Aufwandskonto + den Steuersatz und schreibt posting_rule.
 * Nur Buchungen "Aufwand (3000–69999) an Kreditor (70000+)".
 */
export async function learnVorkontierung(opts: Options = {}) {
  const { dryRun = false, minCount = 2, minConfidence = 0.5 } = opts;
  const postings = JSON.parse(readFileSync(importsPath("bb-buchungen.json"), "utf8")) as BbPosting[];

  // je Kreditorkonto: Aufwandskonto-Häufigkeit + Steuersatz-Häufigkeit
  type Agg = { accounts: Map<string, number>; vats: Map<string, number>; total: number; name: string };
  const byCreditor = new Map<string, Agg>();
  for (const p of postings) {
    const cred = Number(p.credit_postingaccount_number);
    const deb = Number(p.debit_postingaccount_number);
    if (!(cred >= 70000 && deb >= 3000 && deb < 70000)) continue;
    const key = String(p.credit_postingaccount_number);
    const agg =
      byCreditor.get(key) ??
      byCreditor.set(key, { accounts: new Map(), vats: new Map(), total: 0, name: "" }).get(key)!;
    bump(agg.accounts, String(p.debit_postingaccount_number));
    bump(agg.vats, String(Math.round(Number(p.vat) || 0)));
    agg.total += 1;
    if (!agg.name) agg.name = p.receipts_assigned_counterparties || p.postingtext || "";
  }

  // Lookups
  const orgs = await pagedSelect<{ id: string; name: string; supplier_number: string | null }>(
    "organization",
    "id, name, supplier_number",
  );
  const orgBySupNum = new Map(orgs.filter((o) => o.supplier_number).map((o) => [o.supplier_number!, o]));
  const taxCodes = await pagedSelect<{ id: string; code: string; rate: number }>(
    "tax_code",
    "id, code, rate",
  );
  const taxByRate = new Map(
    taxCodes.filter((t) => t.code.startsWith("VST")).map((t) => [Math.round(t.rate), t.id]),
  );
  const existingManual = new Set(
    (
      await pagedSelect<{ organization_id: string; source: string }>(
        "posting_rule",
        "organization_id, source",
      )
    )
      .filter((r) => r.source === "manual")
      .map((r) => r.organization_id),
  );

  const rows: Record<string, unknown>[] = [];
  const upserts: Record<string, unknown>[] = [];
  let matched = 0;
  let skippedManual = 0;

  for (const [credNum, agg] of byCreditor) {
    const [account, accCount] = topOf(agg.accounts);
    const [vat] = topOf(agg.vats);
    const conf = agg.total ? Math.round((accCount / agg.total) * 1000) / 1000 : 0;
    const org = orgBySupNum.get(credNum);
    const taxId = taxByRate.get(Number(vat)) ?? null;

    rows.push({
      kreditorkonto: credNum,
      name: agg.name,
      org_id: org?.id ?? "",
      org_name: org?.name ?? "(keine Org)",
      aufwandskonto: account,
      belege: agg.total,
      treffer: accCount,
      konfidenz: conf,
      ust: vat,
    });

    if (!org || agg.total < minCount || conf < minConfidence) continue;
    if (existingManual.has(org.id)) {
      skippedManual += 1;
      continue;
    }
    matched += 1;
    upserts.push({
      organization_id: org.id,
      expense_account: account,
      tax_code_id: taxId,
      source: "learned",
      sample_count: agg.total,
      confidence: conf,
      is_active: true,
    });
  }

  rows.sort((a, b) => Number(b.belege) - Number(a.belege));
  writeFileSync(
    importsPath("bb-vorkontierung.csv"),
    [
      "kreditorkonto;name;org_id;org_name;aufwandskonto;belege;treffer;konfidenz;ust",
      ...rows.map((r) =>
        [r.kreditorkonto, r.name, r.org_id, r.org_name, r.aufwandskonto, r.belege, r.treffer, r.konfidenz, r.ust]
          .map((v) => {
            const s = v == null ? "" : String(v);
            return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      ),
    ].join("\r\n"),
    "latin1",
  );

  let backfilled = 0;
  if (!dryRun && upserts.length) {
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await supabase
        .from("posting_rule")
        .upsert(upserts.slice(i, i + 500), { onConflict: "organization_id" });
      if (error) throw new Error(`posting_rule upsert: ${error.message}`);
    }
    backfilled = await applyRulesToExisting();
  }

  return {
    dryRun,
    kreditoren_mit_historie: byCreditor.size,
    regeln_geschrieben: dryRun ? 0 : upserts.length,
    kandidaten: upserts.length + skippedManual,
    org_zugeordnet: matched,
    ohne_org: rows.filter((r) => !r.org_id).length,
    manuell_beibehalten: skippedManual,
    bestandsbelege_vorkontiert: backfilled,
    csv: "imports/bb-vorkontierung.csv",
  };
}

/**
 * Trägt den Vorkontierungs-Vorschlag in bereits erfasste Eingangsrechnungen ein,
 * die noch kein Aufwandskonto haben und noch nicht geprüft wurden.
 */
export async function applyRulesToExisting(): Promise<number> {
  const rules = new Map(
    (
      await pagedSelect<{
        organization_id: string;
        expense_account: string;
        tax_code_id: string | null;
        is_active: boolean;
      }>("posting_rule", "organization_id, expense_account, tax_code_id, is_active")
    )
      .filter((r) => r.is_active)
      .map((r) => [r.organization_id, r]),
  );
  const docs = await pagedSelect<{
    id: string;
    supplier_organization_id: string | null;
    ledger_account: string | null;
    status: string;
  }>(
    "incoming_document",
    "id, supplier_organization_id, ledger_account, status",
  );

  let n = 0;
  for (const d of docs) {
    if (d.ledger_account || !d.supplier_organization_id) continue;
    if (!["extracted", "captured"].includes(d.status)) continue;
    const rule = rules.get(d.supplier_organization_id);
    if (!rule) continue;
    await supabase
      .from("incoming_document")
      .update({ ledger_account: rule.expense_account, tax_code_id: rule.tax_code_id })
      .eq("id", d.id);
    await supabase
      .from("incoming_document_item")
      .update({ ledger_account: rule.expense_account, tax_code_id: rule.tax_code_id })
      .eq("incoming_document_id", d.id)
      .is("ledger_account", null);
    n += 1;
  }
  return n;
}
