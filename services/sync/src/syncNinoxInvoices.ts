import { fetchNinoxRecords } from "./ninox";
import {
  bulkUpsertByExternalId,
  loadNinoxFirmenMap,
  loadSalesOrderMap,
  pagedSelect,
  setSyncState,
} from "./db";

type Options = { dryRun?: boolean };

const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const dateOnly = (v: unknown): string | null => {
  const x = s(v);
  return x ? x.slice(0, 10) : null;
};
const refId = (v: unknown): string | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return x == null ? null : String(x);
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const taxRate = (v: unknown): number | null => {
  const m = s(v).match(/([\d.,]+)/);
  return m ? Number(m[1].replace(",", ".")) : null;
};

export async function syncNinoxInvoices(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const firmenMap = await loadNinoxFirmenMap();
  const orderMap = await loadSalesOrderMap("ninox");

  const existingInv = new Set(
    (await pagedSelect<{ external_id: string | null }>("sales_invoice", "external_id", ["source", "ninox"]))
      .map((r) => r.external_id)
      .filter((x): x is string => !!x),
  );
  const existingItems = new Set(
    (await pagedSelect<{ external_id: string | null }>("sales_invoice_item", "external_id", ["source", "ninox"]))
      .map((r) => r.external_id)
      .filter((x): x is string => !!x),
  );

  // Positionen (DE) laden, nach Rechnung ("Rechnungen") gruppieren
  const itemsByInvoice = new Map<string, { id: number; fields: Record<string, unknown> }[]>();
  await fetchNinoxRecords("DE", async (rows, meta) => {
    for (const rec of rows) {
      const parent = refId(rec.fields["Rechnungen"]);
      if (!parent) continue;
      const arr = itemsByInvoice.get(parent) ?? [];
      arr.push(rec);
      itemsByInvoice.set(parent, arr);
    }
    process.stdout.write(`\r  Rg-Positionen geladen: ${meta.loaded}   `);
  });
  process.stdout.write("\n");

  const invRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  let seen = 0;
  let noOrg = 0;

  await fetchNinoxRecords("CE", async (rows, meta) => {
    for (const rec of rows) {
      seen += 1;
      const f = rec.fields;
      const fid = refId(f["Firmen"]);
      const orgId = fid ? firmenMap.get(`L:${fid}`) : undefined;
      if (!orgId) noOrg += 1;
      const auftragId = refId(f["Aufträge"]);
      const soId = auftragId ? orderMap.get(`ninox:MC:${auftragId}`) : undefined;

      const items = itemsByInvoice.get(String(rec.id)) ?? [];
      let net = 0;
      let tax = 0;
      for (const it of items) {
        const g = it.fields;
        const qty = num(g["Anzahl"]) ?? 0;
        const unit = num(g["Preis pro Einheit"]) ?? 0;
        const line = qty * unit;
        net += line;
        const rate = taxRate(g["Steuersatz in %"]);
        if (rate) tax += (line * rate) / 100;
      }
      net = round2(net);
      tax = round2(tax);

      const extId = `ninox:CE:${rec.id}`;
      invRows.push({
        source: "ninox",
        external_id: extId,
        organization_id: orgId ?? null,
        sales_order_id: soId ?? null,
        invoice_number: s(f["Archiv ID"]) || null,
        kind: "invoice",
        invoice_date: dateOnly(f["Datum"]),
        service_date: dateOnly(f["Lieferdatum"]),
        net_total: net || null,
        tax_total: tax || null,
        gross_total: net ? round2(net + tax) : null,
        billing_address_snapshot: {
          name: s(f["Name oder Firma"]),
          name2: s(f["Name oder Firma Zusatz"]),
          street: s(f["Straße"]),
          zip: s(f["Postleitzahl"]),
          city: s(f["Ort"]),
        },
        raw: f,
        synced_at: new Date().toISOString(),
      });

      items.forEach((it) => {
        const g = it.fields;
        const qty = num(g["Anzahl"]);
        const unit = num(g["Preis pro Einheit"]);
        itemRows.push({
          _inv_ext: extId,
          source: "ninox",
          external_id: `ninox:DE:${it.id}`,
          position: num(g["Pos."]),
          description: s(g["Artikel Beschreibung"]) || null,
          quantity: qty,
          unit_price: unit,
          tax_rate: taxRate(g["Steuersatz in %"]),
          net_amount: qty != null && unit != null ? round2(qty * unit) : null,
          raw: g,
        });
      });
    }
    process.stdout.write(`\r  Rechnungen geladen: ${seen}/${meta.loaded}   `);
  });
  process.stdout.write("\n");

  if (dryRun) {
    return { seen, invoices: invRows.length, items: itemRows.length, noOrg, dryRun };
  }

  const ir = await bulkUpsertByExternalId("sales_invoice", invRows, existingInv);

  const siMap = new Map(
    (await pagedSelect<{ id: string; external_id: string | null }>("sales_invoice", "id, external_id", ["source", "ninox"]))
      .filter((r) => r.external_id)
      .map((r) => [r.external_id as string, r.id]),
  );
  const finalItems = itemRows
    .map((r) => {
      const { _inv_ext, ...rest } = r as Record<string, unknown> & { _inv_ext: string };
      const siId = siMap.get(_inv_ext);
      return siId ? { ...rest, sales_invoice_id: siId } : null;
    })
    .filter((x) => x !== null) as Record<string, unknown>[];

  const it = await bulkUpsertByExternalId("sales_invoice_item", finalItems, existingItems);
  await setSyncState("ninox", "invoices", startedAt, noOrg ? `${noOrg} ohne Org` : null);

  return {
    seen,
    invoices: ir.inserted + ir.updated,
    invoicesNew: ir.inserted,
    items: it.inserted + it.updated,
    noOrg,
    dryRun,
  };
}
