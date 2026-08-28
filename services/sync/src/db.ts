import { supabase } from "./supabase";

export function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

export async function pagedSelect<T>(
  table: string,
  columns: string,
  filter?: [string, string | number],
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + size - 1);
    if (filter) q = q.eq(filter[0], filter[1]) as typeof q;
    const { data, error } = await q;
    if (error) throw new Error(`${table} lesen: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

/** Keyline-Kunden-ID (String) -> organization_id (nach evtl. Merge). */
export async function loadKeylineOrgMap(): Promise<Map<string, string>> {
  const rows = await pagedSelect<{ external_id: string; organization_id: string }>(
    "organization_external_ref",
    "external_id, organization_id",
    ["system", "keyline"],
  );
  return new Map(rows.map((r) => [r.external_id, r.organization_id]));
}

/** 'L:<ninoxFirmenId>' -> organization_id. */
export async function loadNinoxFirmenMap(): Promise<Map<string, string>> {
  const rows = await pagedSelect<{ external_id: string; organization_id: string }>(
    "organization_external_ref",
    "external_id, organization_id",
    ["system", "ninox"],
  );
  return new Map(rows.map((r) => [r.external_id, r.organization_id]));
}

/** Ninox-people-Record-ID (String) -> contact_id. */
export async function loadNinoxContactMap(): Promise<Map<string, string>> {
  const rows = await pagedSelect<{ id: string; external_id: string | null }>(
    "contact",
    "id, external_id",
    ["source", "ninox"],
  );
  const m = new Map<string, string>();
  for (const r of rows) {
    const mch = r.external_id?.match(/^ninox:people:(\d+)$/);
    if (mch) m.set(mch[1], r.id);
  }
  return m;
}

/** sales_order.external_id -> sales_order.id  (optional Filter auf source) */
export async function loadSalesOrderMap(source?: string): Promise<Map<string, string>> {
  const rows = await pagedSelect<{ id: string; external_id: string | null }>(
    "sales_order",
    "id, external_id",
    source ? ["source", source] : undefined,
  );
  const m = new Map<string, string>();
  for (const r of rows) if (r.external_id) m.set(r.external_id, r.id);
  return m;
}

const IN_SET = new Set(["sales_order", "sales_invoice", "sales_order_item", "sales_invoice_item"]);

/**
 * Idempotenter Bulk-Upsert auf `external_id`. Teilt in neue (insert, um
 * created_at zu setzen) und bestehende (upsert) — beides in Chunks.
 */
export async function bulkUpsertByExternalId(
  table: string,
  rows: Record<string, unknown>[],
  existingExtIds: Set<string>,
): Promise<{ inserted: number; updated: number }> {
  if (!IN_SET.has(table)) throw new Error(`bulkUpsertByExternalId: Tabelle ${table} nicht erlaubt`);
  const toInsert = rows.filter((r) => !existingExtIds.has(String(r.external_id)));
  const toUpdate = rows.filter((r) => existingExtIds.has(String(r.external_id)));
  let inserted = 0;
  let updated = 0;
  for (const part of chunk(toInsert, 300)) {
    const { error } = await supabase.from(table).insert(part);
    if (error) throw new Error(`${table} insert: ${error.message}`);
    inserted += part.length;
  }
  for (const part of chunk(toUpdate, 300)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict: "external_id" });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
    updated += part.length;
  }
  return { inserted, updated };
}

export async function setSyncState(
  system: string,
  resource: string,
  startedAt: Date,
  note?: string | null,
) {
  const { error } = await supabase.from("external_sync_state").upsert(
    {
      system,
      resource,
      last_run_at: startedAt.toISOString(),
      last_status: "ok",
      error: note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "system,resource" },
  );
  if (error) throw new Error(`external_sync_state: ${error.message}`);
}
