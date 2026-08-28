import { fetchKeylinePaged } from "./keyline";
import {
  bulkUpsertByExternalId,
  loadKeylineOrgMap,
  pagedSelect,
  setSyncState,
} from "./db";

type Options = { dryRun?: boolean };

const cents = (v: unknown): number | null =>
  v == null || v === "" ? null : Math.round(Number(v)) / 100;
const dateOnly = (v: unknown): string | null => {
  const s = v == null ? "" : String(v);
  return s ? s.slice(0, 10) : null;
};

type KOrder = {
  id: number;
  reference: string | null;
  state: string | null;
  customer_id: number | null;
  contact_id: number | null;
  costs: number | null;
  deliver_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  business_unit_id: number | null;
  products?: { id: number; name?: string; kind?: string }[];
};

export async function syncKeylineOrders(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const orgMap = await loadKeylineOrgMap();

  const existingOrders = new Set(
    (
      await pagedSelect<{ external_id: string | null }>(
        "sales_order",
        "external_id",
        ["source", "keyline"],
      )
    )
      .map((r) => r.external_id)
      .filter((x): x is string => !!x),
  );
  const existingItems = new Set(
    (
      await pagedSelect<{ external_id: string | null }>(
        "sales_order_item",
        "external_id",
        ["source", "keyline"],
      )
    )
      .map((r) => r.external_id)
      .filter((x): x is string => !!x),
  );

  const orderRows: Record<string, unknown>[] = [];
  let seen = 0;
  let noOrg = 0;

  await fetchKeylinePaged<KOrder>("/sales/orders", async (rows, meta) => {
    for (const o of rows) {
      seen += 1;
      const orgId = o.customer_id != null ? orgMap.get(String(o.customer_id)) : undefined;
      if (!orgId) noOrg += 1;
      orderRows.push({
        source: "keyline",
        external_id: `keyline:order:${o.id}`,
        organization_id: orgId ?? null,
        order_number: o.reference,
        state: o.state,
        order_date: dateOnly(o.created_at),
        delivery_date: dateOnly(o.deliver_at),
        due_date: dateOnly(o.due_at),
        net_total: cents(o.costs),
        business_unit_id: o.business_unit_id,
        raw: o,
        synced_at: new Date().toISOString(),
      });
    }
    process.stdout.write(`\r  Aufträge geladen: ${seen}/${meta.total}   `);
  });
  process.stdout.write("\n");

  if (dryRun) {
    return { seen, orders: orderRows.length, noOrg, dryRun };
  }

  const or = await bulkUpsertByExternalId("sales_order", orderRows, existingOrders);

  // Positionen: brauchen die sales_order.id -> Map über external_id
  const soMap = new Map(
    (
      await pagedSelect<{ id: string; external_id: string | null }>(
        "sales_order",
        "id, external_id",
        ["source", "keyline"],
      )
    )
      .filter((r) => r.external_id)
      .map((r) => [r.external_id as string, r.id]),
  );

  const itemRows: Record<string, unknown>[] = [];
  for (const r of orderRows) {
    const o = r.raw as KOrder;
    const soId = soMap.get(`keyline:order:${o.id}`);
    if (!soId) continue;
    (o.products ?? []).forEach((p, i) => {
      itemRows.push({
        sales_order_id: soId,
        source: "keyline",
        external_id: `keyline:orderitem:${p.id}`,
        position: i + 1,
        description: p.name ?? null,
        kind: p.kind ?? null,
        raw: p,
      });
    });
  }
  const it = await bulkUpsertByExternalId("sales_order_item", itemRows, existingItems);

  await setSyncState("keyline", "orders", startedAt, noOrg ? `${noOrg} ohne Org` : null);

  return {
    seen,
    orders: or.inserted + or.updated,
    ordersNew: or.inserted,
    items: it.inserted + it.updated,
    noOrg,
    dryRun,
  };
}
