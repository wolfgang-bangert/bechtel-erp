import { createClient } from "@/lib/supabase/server";

export type BookingLine = {
  docId: string;
  kind: string;
  belegdatum: string | null;
  belegNr: string | null;
  partner: string;
  sh: "S" | "H";
  konto: string;
  kontoName: string;
  gegenkonto: string;
  gegenkontoName: string;
  bu: string;
  kost: string;
  text: string;
  brutto: number;
  href: string;
};

export type SkipRow = { belegNr: string; partner: string; grund: string };

export type Preview = {
  scope: "kreditor" | "debitor";
  from: string;
  to: string;
  lines: BookingLine[];
  skipped: SkipRow[];
  belege: number;
  brutto: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const EU = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","GR","HU","IE","IT","LV","LT",
  "LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

// --- Kreditoren (Eingangsrechnungen) --------------------------------------------

type Alloc = { amount: number | null; cost_center_id: string | null };
type Item = {
  net_amount: number | null;
  tax_rate: number | null;
  ledger_account: string | null;
  tax_code_id: string | null;
  cost_center_id: string | null;
  incoming_document_allocation: Alloc[];
};
type IncDoc = {
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
  supplier_name: string | null;
  organization: { supplier_number: string | null } | null;
  incoming_document_item: Item[];
};

function dominantRate(tb: Record<string, number> | null, net: number, tax: number): number {
  const keys = Object.keys(tb ?? {});
  if (keys.length) return Math.round(Number(keys.sort((a, b) => (tb![b] ?? 0) - (tb![a] ?? 0))[0]));
  return net > 0 && tax > 0 ? Math.round((tax / net) * 100) : 0;
}

export async function kreditorPreview(from: string, to: string): Promise<Preview> {
  const supabase = await createClient();
  const [{ data: rows }, { data: accs }, { data: kost }, { data: tcs }] = await Promise.all([
    supabase
      .from("incoming_document")
      .select(
        "id, doc_type, status, doc_number, doc_date, net_amount, tax_amount, gross_amount, tax_breakdown, " +
          "ledger_account, tax_code_id, cost_center_id, supplier_name, " +
          "organization:supplier_organization_id ( supplier_number ), " +
          "incoming_document_item ( net_amount, tax_rate, ledger_account, tax_code_id, cost_center_id, " +
          "incoming_document_allocation ( amount, cost_center_id ) )",
      )
      .gte("doc_date", from)
      .lte("doc_date", to)
      .in("doc_type", ["invoice", "credit_note"])
      .in("status", ["extracted", "reviewed", "booked", "exported"])
      .order("doc_date"),
    supabase.from("ledger_account").select("number, name"),
    supabase.from("cost_center").select("id, number"),
    supabase.from("tax_code").select("id, datev_tax_key"),
  ]);

  const accName = new Map((accs ?? []).map((a) => [a.number, a.name]));
  const kostNum = new Map((kost ?? []).map((c) => [c.id, c.number]));
  const buKey = new Map((tcs ?? []).map((t) => [t.id, (t.datev_tax_key ?? "").trim()]));

  const lines: BookingLine[] = [];
  const skipped: SkipRow[] = [];
  let brutto = 0;
  const booked = new Set<string>();

  for (const d of (rows ?? []) as unknown as IncDoc[]) {
    const partner = d.supplier_name ?? "?";
    const kreditor = d.organization?.supplier_number?.trim() ?? "";
    if (!d.doc_date || !d.doc_number?.trim()) {
      skipped.push({ belegNr: d.doc_number ?? d.id.slice(0, 8), partner, grund: "kein Datum/Nummer" });
      continue;
    }
    if (!/^\d{4,6}$/.test(kreditor)) {
      skipped.push({ belegNr: d.doc_number, partner, grund: "keine gültige Kreditornummer" });
      continue;
    }
    const dRate = dominantRate(d.tax_breakdown, d.net_amount ?? 0, d.tax_amount ?? 0);
    const dKonto = d.ledger_account?.trim() ?? "";
    const dBu = buKey.get(d.tax_code_id ?? "") ?? "";
    const dKost = kostNum.get(d.cost_center_id ?? "") ?? "";

    type U = { net: number; konto: string; rate: number; bu: string; kost: string };
    const units: U[] = [];
    const items = d.incoming_document_item ?? [];
    if (items.length) {
      for (const it of items) {
        const konto = it.ledger_account?.trim() || dKonto;
        const rate = it.tax_rate != null ? Math.round(Number(it.tax_rate)) : dRate;
        const bu = buKey.get(it.tax_code_id ?? "") || dBu;
        const baseKost = kostNum.get(it.cost_center_id ?? "") || dKost;
        const net = it.net_amount ?? 0;
        const al = (it.incoming_document_allocation ?? []).filter((a) => (a.amount ?? 0) !== 0);
        if (al.length) {
          let used = 0;
          for (const a of al) {
            used += a.amount ?? 0;
            units.push({ net: a.amount ?? 0, konto, rate, bu, kost: kostNum.get(a.cost_center_id ?? "") || baseKost });
          }
          const rest = r2(net - used);
          if (Math.abs(rest) >= 0.01) units.push({ net: rest, konto, rate, bu, kost: baseKost });
        } else units.push({ net, konto, rate, bu, kost: baseKost });
      }
    } else {
      units.push({ net: d.net_amount ?? 0, konto: dKonto, rate: dRate, bu: dBu, kost: dKost });
    }

    if (units.some((u) => !u.konto)) {
      skipped.push({ belegNr: d.doc_number, partner, grund: "kein Aufwandskonto" });
      continue;
    }

    const agg = new Map<string, U & { gross: number }>();
    for (const u of units) {
      const gross = r2(u.net + r2(u.net * (u.rate / 100)));
      const k = `${u.konto}|${u.bu}|${u.kost}|${u.rate}`;
      const cur = agg.get(k);
      if (cur) cur.gross = r2(cur.gross + gross);
      else agg.set(k, { ...u, gross });
    }
    const grouped = [...agg.values()].filter((u) => Math.abs(u.gross) >= 0.005);
    const sum = r2(grouped.reduce((s, u) => s + u.gross, 0));
    const target = d.gross_amount ?? sum;
    if (grouped.length && Math.abs(sum - target) >= 0.01) {
      grouped.sort((a, b) => b.gross - a.gross);
      grouped[0].gross = r2(grouped[0].gross + (target - sum));
    }

    const isCredit = d.doc_type === "credit_note";
    for (const u of grouped) {
      lines.push({
        docId: d.id,
        kind: d.doc_type,
        belegdatum: d.doc_date,
        belegNr: d.doc_number,
        partner,
        sh: isCredit ? "H" : "S",
        konto: u.konto,
        kontoName: accName.get(u.konto) ?? "",
        gegenkonto: kreditor,
        gegenkontoName: partner,
        bu: u.bu,
        kost: u.kost,
        text: `${isCredit ? "GS" : "ER"} ${d.doc_number} ${partner}`.slice(0, 60),
        brutto: u.gross,
        href: `/eingangsrechnungen/${d.id}`,
      });
      brutto += isCredit ? -u.gross : u.gross;
    }
    booked.add(d.id);
  }

  return { scope: "kreditor", from, to, lines, skipped, belege: booked.size, brutto: r2(brutto) };
}

// --- Debitoren (Ausgangsrechnungen) -------------------------------------------

type SalesInv = {
  id: string;
  kind: string;
  invoice_number: string | null;
  invoice_date: string | null;
  net_total: number | null;
  tax_total: number | null;
  gross_total: number | null;
  tax_breakdown: Record<string, number> | null;
  organization: { name: string | null; customer_number: string | null; tax_country: string | null } | null;
};

function revAccount(rate: number, country: string, m: Record<string, string>): string {
  if (rate >= 18) return m.standard_19 ?? "";
  if (rate >= 6 && rate < 8) return m.standard_7 ?? "";
  const c = (country || "DE").toUpperCase();
  if (c === "DE") return m.tax_free_other ?? m.fallback ?? "";
  if (EU.has(c)) return m.reverse_charge_eu ?? m.fallback ?? "";
  return m.export_third_country ?? m.fallback ?? "";
}

export async function debitorPreview(from: string, to: string): Promise<Preview> {
  const supabase = await createClient();
  const [{ data: rows }, { data: settings }, { data: accs }] = await Promise.all([
    supabase
      .from("sales_invoice")
      .select(
        "id, kind, invoice_number, invoice_date, net_total, tax_total, gross_total, tax_breakdown, " +
          "organization:organization ( name, customer_number, tax_country )",
      )
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .in("kind", ["invoice", "credit_note"])
      .order("invoice_date"),
    supabase.from("setting").select("key, value"),
    supabase.from("ledger_account").select("number, name"),
  ]);

  const map = ((settings ?? []).find((s) => s.key === "datev.revenue_accounts")?.value ?? {}) as Record<
    string,
    string
  >;
  const accName = new Map((accs ?? []).map((a) => [a.number, a.name]));

  const lines: BookingLine[] = [];
  const skipped: SkipRow[] = [];
  let brutto = 0;
  const booked = new Set<string>();

  for (const inv of (rows ?? []) as unknown as SalesInv[]) {
    const partner = inv.organization?.name ?? "?";
    const debitor = inv.organization?.customer_number?.trim() ?? "";
    if (!inv.invoice_date || !inv.invoice_number?.trim()) {
      skipped.push({ belegNr: inv.invoice_number ?? inv.id.slice(0, 8), partner, grund: "Entwurf / keine Nummer" });
      continue;
    }
    if (!/^\d{4,6}$/.test(debitor)) {
      skipped.push({ belegNr: inv.invoice_number, partner, grund: "keine gültige Debitorennummer" });
      continue;
    }

    const gross = inv.gross_total ?? 0;
    const net = inv.net_total ?? 0;
    const tb = inv.tax_breakdown;
    const parts: [number, number][] = [];
    if (tb && Object.keys(tb).length) {
      for (const [rs, ta] of Object.entries(tb)) {
        const rate = Math.round(Number(rs) * 100);
        const netP = rate > 0 ? ta / (rate / 100) : 0;
        parts.push([rate, r2(netP + ta)]);
      }
      const s = parts.reduce((a, [, g]) => a + g, 0);
      if (parts.length && Math.abs(s - gross) >= 0.01) {
        parts.sort((a, b) => b[1] - a[1]);
        parts[0][1] = r2(parts[0][1] + (gross - s));
      }
    } else {
      const rate = net > 0 && (inv.tax_total ?? 0) > 0 ? Math.round(((inv.tax_total ?? 0) / net) * 100) : 0;
      parts.push([rate, gross]);
    }

    const isCredit = inv.kind === "credit_note";
    for (const [rate, g] of parts) {
      if (Math.abs(g) < 0.005) continue;
      const konto = revAccount(rate, inv.organization?.tax_country ?? "DE", map);
      lines.push({
        docId: inv.id,
        kind: inv.kind,
        belegdatum: inv.invoice_date,
        belegNr: inv.invoice_number,
        partner,
        sh: isCredit ? "H" : "S",
        konto: debitor,
        kontoName: partner,
        gegenkonto: konto,
        gegenkontoName: accName.get(konto) ?? "",
        bu: "",
        kost: "",
        text: `${isCredit ? "GS" : "RE"} ${inv.invoice_number} ${partner}`.slice(0, 60),
        brutto: g,
        href: `/rechnungen/${inv.id}`,
      });
      brutto += isCredit ? -g : g;
    }
    booked.add(inv.id);
  }

  return { scope: "debitor", from, to, lines, skipped, belege: booked.size, brutto: r2(brutto) };
}
