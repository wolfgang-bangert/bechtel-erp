import { fetchNinoxRecords } from "./ninox";
import {
  bulkUpsertByExternalId,
  loadNinoxContactMap,
  loadNinoxFirmenMap,
  pagedSelect,
  setSyncState,
} from "./db";

type Options = { dryRun?: boolean };

const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const num = (v: unknown): number | null =>
  v == null || v === "" ? null : Number(v);
const dateOnly = (v: unknown): string | null => {
  const x = s(v);
  return x ? x.slice(0, 10) : null;
};
const refId = (v: unknown): string | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return x == null ? null : String(x);
};
const stripHtml = (v: unknown) =>
  s(v).replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim();

export async function syncNinoxOrders(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const firmenMap = await loadNinoxFirmenMap();
  const contactMap = await loadNinoxContactMap();

  const existingOrders = new Set(
    (await pagedSelect<{ external_id: string | null }>("sales_order", "external_id", ["source", "ninox"]))
      .map((r) => r.external_id)
      .filter((x): x is string => !!x),
  );
  const existingItems = new Set(
    (await pagedSelect<{ external_id: string | null }>("sales_order_item", "external_id", ["source", "ninox"]))
      .map((r) => r.external_id)
      .filter((x): x is string => !!x),
  );

  // Positionen (NC) laden und nach Auftrag (Feld "Aufträge") gruppieren
  const itemsByOrder = new Map<string, { id: number; fields: Record<string, unknown> }[]>();
  let ncSeen = 0;
  await fetchNinoxRecords("NC", async (rows, meta) => {
    for (const rec of rows) {
      ncSeen += 1;
      const parent = refId(rec.fields["Aufträge"]);
      if (!parent) continue;
      const arr = itemsByOrder.get(parent) ?? [];
      arr.push(rec);
      itemsByOrder.set(parent, arr);
    }
    process.stdout.write(`\r  Positionen geladen: ${meta.loaded}   `);
  });
  process.stdout.write("\n");

  const orderRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  let seen = 0;
  let noOrg = 0;

  await fetchNinoxRecords("MC", async (rows, meta) => {
    for (const rec of rows) {
      seen += 1;
      const f = rec.fields;
      const orgId = (() => {
        const fid = refId(f["Firmen"]);
        return fid ? firmenMap.get(`L:${fid}`) : undefined;
      })();
      if (!orgId) noOrg += 1;
      const contactId = (() => {
        const cid = refId(f["Ansprechpartner"]);
        return cid ? contactMap.get(cid) : undefined;
      })();

      const extId = `ninox:MC:${rec.id}`;
      orderRows.push({
        source: "ninox",
        external_id: extId,
        organization_id: orgId ?? null,
        contact_id: contactId ?? null,
        order_number: s(f["Auftrag Nummer"]) || null,
        state: s(f["status"]) || null,
        order_date: dateOnly(f["Auftrag Datum"]),
        delivery_date: dateOnly(f["Liefertermin intern"]),
        net_total: num(f["Auftragswert"]),
        raw: f,
        synced_at: new Date().toISOString(),
      });

      (itemsByOrder.get(String(rec.id)) ?? []).forEach((it) => {
        const g = it.fields;
        const qty = num(g["Anzahl"]);
        const unit = num(g["Preis pro Einheit"]);
        itemRows.push({
          _order_ext: extId,
          source: "ninox",
          external_id: `ninox:NC:${it.id}`,
          position: num(g["Pos."]),
          description: stripHtml(g["Artikel Beschreibung"]) || s(g["Eindruck Text"]) || null,
          quantity: qty,
          unit_price: unit,
          net_amount: qty != null && unit != null ? Math.round(qty * unit * 100) / 100 : null,
          raw: g,
        });
      });
    }
    process.stdout.write(`\r  Aufträge geladen: ${seen}/${meta.loaded}   `);
  });
  process.stdout.write("\n");

  if (dryRun) {
    return { seen, ncSeen, orders: orderRows.length, items: itemRows.length, noOrg, dryRun };
  }

  const or = await bulkUpsertByExternalId("sales_order", orderRows, existingOrders);

  const soMap = new Map(
    (await pagedSelect<{ id: string; external_id: string | null }>("sales_order", "id, external_id", ["source", "ninox"]))
      .filter((r) => r.external_id)
      .map((r) => [r.external_id as string, r.id]),
  );
  const finalItems = itemRows
    .map((r) => {
      const { _order_ext, ...rest } = r as Record<string, unknown> & { _order_ext: string };
      const soId = soMap.get(_order_ext);
      return soId ? { ...rest, sales_order_id: soId } : null;
    })
    .filter((x) => x !== null) as Record<string, unknown>[];

  const it = await bulkUpsertByExternalId("sales_order_item", finalItems, existingItems);
  await setSyncState("ninox", "orders", startedAt, noOrg ? `${noOrg} ohne Org` : null);

  return {
    seen,
    orders: or.inserted + or.updated,
    ordersNew: or.inserted,
    items: it.inserted + it.updated,
    noOrg,
    dryRun,
  };
}
