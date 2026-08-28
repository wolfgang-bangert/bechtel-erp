import { fetchKeylinePaged } from "./keyline";
import {
  bulkUpsertByExternalId,
  loadKeylineOrgMap,
  loadSalesOrderMap,
  pagedSelect,
  setSyncState,
} from "./db";

type Options = { dryRun?: boolean };

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
  address?: unknown;
};

function normTaxes(taxes: Record<string, number> | null): Record<string, number> | null {
  if (!taxes) return null;
  const out: Record<string, number> = {};
  for (const [rate, amount] of Object.entries(taxes)) out[rate] = Number(amount) / 100;
  return out;
}

async function syncResource(
  path: string,
  kind: "invoice" | "credit_note",
  idPrefix: string,
  orgMap: Map<string, string>,
  orderMap: Map<string, string>,
  existing: Set<string>,
) {
  const rows: Record<string, unknown>[] = [];
  let seen = 0;
  let noOrg = 0;

  await fetchKeylinePaged<KInvoice>(path, async (list, meta) => {
    for (const inv of list) {
      seen += 1;
      const orgId =
        inv.recipient_id != null ? orgMap.get(String(inv.recipient_id)) : undefined;
      if (!orgId) noOrg += 1;
      const net = eur(inv.net_total);
      const gross = eur(inv.gross_total);
      rows.push({
        source: "keyline",
        external_id: `keyline:${idPrefix}:${inv.id}`,
        organization_id: orgId ?? null,
        sales_order_id:
          inv.order_id != null ? (orderMap.get(`keyline:order:${inv.order_id}`) ?? null) : null,
        invoice_number: inv.number,
        kind,
        reversed_invoice_external_id:
          inv.reversed_invoice_id != null
            ? `keyline:invoice:${inv.reversed_invoice_id}`
            : null,
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
      });
    }
    process.stdout.write(`\r  ${path}: ${seen}/${meta.total}   `);
  });
  process.stdout.write("\n");

  return { rows, seen, noOrg };
}

export async function syncKeylineInvoices(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
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
  );
  const cn = await syncResource(
    "/accounting/credit_notes",
    "credit_note",
    "creditnote",
    orgMap,
    orderMap,
    existing,
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
    dryRun,
  };
}
