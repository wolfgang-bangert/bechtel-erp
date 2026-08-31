import { fetchKeylinePaged, fetchKeylineOne } from "./keyline";
import { supabase } from "./supabase";
import {
  bulkUpsertByExternalId,
  loadKeylineOrgMap,
  loadSalesOrderMap,
  pagedSelect,
  setSyncState,
} from "./db";

type Options = { dryRun?: boolean; since?: Date | null; full?: boolean };

/** Überlappung, um die nicht streng monotone updated_at-Sortierung abzufedern. */
const SINCE_OVERLAP_MS = 24 * 3600_000;

const cents = (v: unknown): number | null =>
  v == null || v === "" ? null : Math.round(Number(v)) / 100;
const eur = (v: unknown): number | null =>
  v == null || v === "" ? null : Number(v) / 100;
const dateOnly = (v: unknown): string | null => {
  const s = v == null ? "" : String(v);
  return s ? s.slice(0, 10) : null;
};

type KInvoice = {
  id: number;
  recipient_id: number | null;
  number: string | null;
  net_total: number | null;
  gross_total: number | null;
  paid_at: string | null;
  due_at: string | null;
  billed_at: string | null;
  services_performed_at: string | null;
  taxes: Record<string, number> | null;
  type: string;
  reversed_invoice_id: number | null;
  order_id: number | null;
  business_unit_id: number | null;
  created_at: string;
  updated_at?: string | null;
  address?: unknown;
};

function normTaxes(taxes: Record<string, number> | null): Record<string, number> | null {
  if (!taxes) return null;
  const out: Record<string, number> = {};
  for (const [rate, amount] of Object.entries(taxes)) out[rate] = Number(amount) / 100;
  return out;
}

function invoiceToRow(
  inv: KInvoice,
  kind: "invoice" | "credit_note",
  idPrefix: string,
  orgMap: Map<string, string>,
  orderMap: Map<string, string>,
): Record<string, unknown> {
  const orgId =
    inv.recipient_id != null ? orgMap.get(String(inv.recipient_id)) : undefined;
  const net = eur(inv.net_total);
  const gross = eur(inv.gross_total);
  return {
    source: "keyline",
    external_id: `keyline:${idPrefix}:${inv.id}`,
    organization_id: orgId ?? null,
    sales_order_id:
      inv.order_id != null ? (orderMap.get(`keyline:order:${inv.order_id}`) ?? null) : null,
    invoice_number: inv.number,
    kind,
    reversed_invoice_external_id:
      inv.reversed_invoice_id != null ? `keyline:invoice:${inv.reversed_invoice_id}` : null,
    invoice_date: dateOnly(inv.billed_at) ?? dateOnly(inv.created_at),
    service_date: dateOnly(inv.services_performed_at),
    due_date: dateOnly(inv.due_at),
    paid_at: dateOnly(inv.paid_at),
    net_total: net,
    gross_total: gross,
    tax_total: net != null && gross != null ? Math.round((gross - net) * 100) / 100 : null,
    tax_breakdown: normTaxes(inv.taxes),
    billing_address_snapshot: inv.address ?? null,
    business_unit_id: inv.business_unit_id,
    raw: inv,
    synced_at: new Date().toISOString(),
  };
}

async function syncResource(
  path: string,
  kind: "invoice" | "credit_note",
  idPrefix: string,
  orgMap: Map<string, string>,
  orderMap: Map<string, string>,
  existing: Set<string>,
  since: Date | null,
) {
  const rows: Record<string, unknown>[] = [];
  let seen = 0;
  let noOrg = 0;
  let skipped = 0;
  let staleStreak = 0;
  const cutoff = since ? since.getTime() : null;

  await fetchKeylinePaged<KInvoice>(path, async (list, meta) => {
    let pageNewest = 0;
    for (const inv of list) {
      const upd = inv.updated_at ? Date.parse(inv.updated_at) : NaN;
      if (Number.isFinite(upd)) pageNewest = Math.max(pageNewest, upd);
      if (cutoff != null && Number.isFinite(upd) && upd < cutoff) {
        skipped += 1;
        continue;
      }
      seen += 1;
      const row = invoiceToRow(inv, kind, idPrefix, orgMap, orderMap);
      if (row.organization_id == null) noOrg += 1;
      rows.push(row);
    }
    process.stdout.write(`\r  ${path}: geladen ${seen}, übersprungen ${skipped} / ${meta.total}   `);
    // Inkrementell: sobald zwei Seiten in Folge komplett vor dem Stichtag
    // liegen, ist der Rest (updated_at-absteigend) auch älter → Abbruch.
    if (cutoff != null && pageNewest > 0 && pageNewest < cutoff) {
      staleStreak += 1;
      if (staleStreak >= 2) return false;
    } else {
      staleStreak = 0;
    }
    return true;
  });
  process.stdout.write("\n");

  return { rows, seen, noOrg };
}

/** Stichtag für den inkrementellen Lauf ermitteln. */
async function resolveSince(opts: Options): Promise<Date | null> {
  if (opts.full) return null;
  if (opts.since !== undefined) return opts.since;
  const { data } = await supabase
    .from("external_sync_state")
    .select("last_run_at")
    .eq("system", "keyline")
    .eq("resource", "invoices")
    .maybeSingle();
  if (!data?.last_run_at) return null; // Erstlauf → voll
  return new Date(new Date(data.last_run_at).getTime() - SINCE_OVERLAP_MS);
}

export async function syncKeylineInvoices(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const since = await resolveSince(opts);
  console.log(
    since ? `  inkrementell seit ${since.toISOString()}` : "  Vollständiger Lauf",
  );
  const orgMap = await loadKeylineOrgMap();
  const orderMap = await loadSalesOrderMap("keyline");

  const existing = new Set(
    (
      await pagedSelect<{ external_id: string | null }>(
        "sales_invoice",
        "external_id",
        ["source", "keyline"],
      )
    )
      .map((r) => r.external_id)
      .filter((x): x is string => !!x),
  );

  const inv = await syncResource(
    "/accounting/customer_invoices",
    "invoice",
    "invoice",
    orgMap,
    orderMap,
    existing,
    since,
  );
  const cn = await syncResource(
    "/accounting/credit_notes",
    "credit_note",
    "creditnote",
    orgMap,
    orderMap,
    existing,
    since,
  );

  const allRows = [...inv.rows, ...cn.rows];
  if (dryRun) {
    return {
      invoices: inv.seen,
      creditNotes: cn.seen,
      noOrg: inv.noOrg + cn.noOrg,
      dryRun,
    };
  }

  const r = await bulkUpsertByExternalId("sales_invoice", allRows, existing);

  // Positionen aus raw.line_items materialisieren
  const siMap = new Map(
    (
      await pagedSelect<{ id: string; external_id: string | null }>(
        "sales_invoice",
        "id, external_id",
        ["source", "keyline"],
      )
    )
      .filter((x) => x.external_id)
      .map((x) => [x.external_id as string, x.id]),
  );
  const existingItems = new Set(
    (
      await pagedSelect<{ external_id: string | null }>(
        "sales_invoice_item",
        "external_id",
        ["source", "keyline"],
      )
    )
      .map((x) => x.external_id)
      .filter((x): x is string => !!x),
  );
  const itemRows: Record<string, unknown>[] = [];
  for (const row of allRows) {
    const raw = row.raw as KInvoice & {
      line_items?: {
        id: number;
        net?: string;
        qty?: number;
        tax_rate?: string;
        net_total?: number;
        description?: string;
      }[];
    };
    const siId = siMap.get(String(row.external_id));
    if (!siId || !Array.isArray(raw.line_items)) continue;
    raw.line_items.forEach((li, i) => {
      itemRows.push({
        sales_invoice_id: siId,
        source: "keyline",
        external_id: `keyline:invoiceitem:${li.id}`,
        position: i + 1,
        description: li.description ?? null,
        quantity: li.qty ?? null,
        unit_price: li.net != null ? Number(li.net) : null,
        tax_rate: li.tax_rate != null ? Math.round(Number(li.tax_rate) * 1000) / 10 : null,
        net_amount: li.net_total != null ? Math.round(Number(li.net_total)) / 100 : null,
        raw: li,
      });
    });
  }
  const it = await bulkUpsertByExternalId("sales_invoice_item", itemRows, existingItems);

  await setSyncState(
    "keyline",
    "invoices",
    startedAt,
    inv.noOrg + cn.noOrg ? `${inv.noOrg + cn.noOrg} ohne Org` : null,
  );

  return {
    invoices: inv.seen,
    creditNotes: cn.seen,
    written: r.inserted + r.updated,
    new: r.inserted,
    items: it.inserted + it.updated,
    noOrg: inv.noOrg + cn.noOrg,
    mode: since ? "inkrementell" : "voll",
    dryRun,
  };
}

type KLineItem = {
  id: number;
  net?: string;
  qty?: number;
  tax_rate?: string;
  net_total?: number;
  description?: string;
};

function lineItemRows(raw: KInvoice & { line_items?: KLineItem[] }, siId: string) {
  return (raw.line_items ?? []).map((li, i) => ({
    sales_invoice_id: siId,
    source: "keyline",
    external_id: `keyline:invoiceitem:${li.id}`,
    position: i + 1,
    description: li.description ?? null,
    quantity: li.qty ?? null,
    unit_price: li.net != null ? Number(li.net) : null,
    tax_rate: li.tax_rate != null ? Math.round(Number(li.tax_rate) * 1000) / 10 : null,
    net_amount: li.net_total != null ? Math.round(Number(li.net_total)) / 100 : null,
    raw: li,
  }));
}

/** Genau eine Keyline-Rechnung (per Keyline-ID) nachziehen — ohne Vollscan. */
export async function refreshKeylineInvoice(keylineId: number) {
  const orgMap = await loadKeylineOrgMap();
  const orderMap = await loadSalesOrderMap("keyline");

  let kind: "invoice" | "credit_note" = "invoice";
  let idPrefix = "invoice";
  let inv = await fetchKeylineOne<KInvoice & { line_items?: KLineItem[] }>(
    `/accounting/customer_invoices/${keylineId}`,
  );
  if (!inv) {
    kind = "credit_note";
    idPrefix = "creditnote";
    inv = await fetchKeylineOne<KInvoice & { line_items?: KLineItem[] }>(
      `/accounting/credit_notes/${keylineId}`,
    );
  }
  if (!inv) return { found: false, keylineId };

  const row = invoiceToRow(inv, kind, idPrefix, orgMap, orderMap);
  const { data: up, error } = await supabase
    .from("sales_invoice")
    .upsert(row, { onConflict: "external_id" })
    .select("id")
    .single();
  if (error) throw new Error(`sales_invoice: ${error.message}`);

  const items = lineItemRows(inv, up.id);
  if (items.length) {
    const { error: iErr } = await supabase
      .from("sales_invoice_item")
      .upsert(items, { onConflict: "external_id" });
    if (iErr) throw new Error(`sales_invoice_item: ${iErr.message}`);
  }

  return {
    found: true,
    keylineId,
    kind,
    invoice_number: inv.number,
    gross_total: eur(inv.gross_total),
    items: items.length,
    organization_id: row.organization_id,
  };
}
