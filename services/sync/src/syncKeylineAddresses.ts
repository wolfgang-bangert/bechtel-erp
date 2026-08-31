import { supabase } from "./supabase";
import { fetchKeylineOrgAddresses, type KeylineAddress } from "./keyline";
import { joinStreet } from "./addr";

type Options = { dryRun?: boolean };

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function pickPrimary(addrs: KeylineAddress[], orgName: string): KeylineAddress | null {
  if (addrs.length <= 1) return addrs[0] ?? null;
  const n = norm(orgName).slice(0, 14);
  const byName = n
    ? addrs.find((a) => a.addressee && norm(a.addressee).includes(n))
    : undefined;
  return (
    byName ??
    [...addrs].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))[0]
  );
}

function toAddressRow(a: KeylineAddress, orgId: string) {
  const street = a.street?.trim() || null;
  const houseNumber = a.number?.trim() || null;
  const line1 = joinStreet(street, houseNumber);
  return {
    organization_id: orgId,
    kind: "general",
    line1: line1 || a.addressee?.trim() || "—",
    line2: a.addition?.trim() || null,
    street,
    house_number: houseNumber,
    address_addition: a.addition?.trim() || null,
    zip: a.zip_code?.trim() || null,
    city: a.town?.trim() || null,
    country: (a.country_code?.trim() || "DE").toUpperCase(),
    source: "keyline",
    external_id: `keyline:${a.id}`,
  };
}

async function pagedSelect<T>(table: string, columns: string, filter?: [string, string]): Promise<T[]> {
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

export async function syncKeylineAddresses(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const nowIso = () => new Date().toISOString();

  // Keyline-ID -> organization_id  (+ Name für die Hauptadress-Heuristik)
  const refs = await pagedSelect<{ external_id: string; organization_id: string }>(
    "organization_external_ref",
    "external_id, organization_id",
    ["system", "keyline"],
  );
  const orgRows = await pagedSelect<{ id: string; name: string }>("organization", "id, name");
  const nameById = new Map(orgRows.map((o) => [o.id, o.name]));
  const targets = refs.map((r) => ({
    keylineId: Number(r.external_id),
    orgId: r.organization_id,
    name: nameById.get(r.organization_id) ?? "",
  }));

  // Bestehende Adressen
  const existingAddr = await pagedSelect<{
    external_id: string | null;
    organization_id: string;
  }>("address", "external_id, organization_id");
  const existingExtIds = new Set(
    existingAddr.map((a) => a.external_id).filter((x): x is string => !!x),
  );
  const orgHadAddress = new Set(existingAddr.map((a) => a.organization_id));

  // Abrufen (parallel)
  let fetched = 0;
  const primaries = await pool(targets, 4, async (t) => {
    const list = await fetchKeylineOrgAddresses(t.keylineId);
    fetched += 1;
    if (fetched % 200 === 0) {
      process.stdout.write(`\r  Adressen geladen: ${fetched}/${targets.length}   `);
    }
    const primary = pickPrimary(list, t.name);
    return primary ? { orgId: t.orgId, addr: primary } : null;
  });
  process.stdout.write(`\r  Adressen geladen: ${targets.length}/${targets.length}   \n`);

  const rows = primaries.filter((x): x is { orgId: string; addr: KeylineAddress } => !!x);
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];
  const willBeDefault = new Set<string>();

  for (const { orgId, addr } of rows) {
    const row = toAddressRow(addr, orgId);
    if (existingExtIds.has(row.external_id)) {
      toUpdate.push(row);
    } else {
      const isDefault = !orgHadAddress.has(orgId) && !willBeDefault.has(orgId);
      if (isDefault) willBeDefault.add(orgId);
      toInsert.push({ ...row, is_default: isDefault });
    }
  }

  if (dryRun) {
    return { targets: targets.length, withAddress: rows.length, insert: toInsert.length, update: toUpdate.length, dryRun };
  }

  let inserted = 0;
  let updated = 0;
  for (const part of chunk(toInsert, 200)) {
    const { error } = await supabase.from("address").insert(part);
    if (error) throw new Error(`address einfügen: ${error.message}`);
    inserted += part.length;
    process.stdout.write(`\r  geschrieben: neu ${inserted}, aktualisiert ${updated}   `);
  }
  for (const part of chunk(toUpdate, 200)) {
    const { error } = await supabase
      .from("address")
      .upsert(part, { onConflict: "external_id" });
    if (error) throw new Error(`address aktualisieren: ${error.message}`);
    updated += part.length;
    process.stdout.write(`\r  geschrieben: neu ${inserted}, aktualisiert ${updated}   `);
  }
  process.stdout.write("\n");

  const { error: stErr } = await supabase.from("external_sync_state").upsert(
    {
      system: "keyline",
      resource: "addresses",
      last_run_at: startedAt.toISOString(),
      last_cursor: null,
      last_status: "ok",
      error: null,
      updated_at: nowIso(),
    },
    { onConflict: "system,resource" },
  );
  if (stErr) throw new Error(`external_sync_state: ${stErr.message}`);

  return {
    targets: targets.length,
    withAddress: rows.length,
    insert: inserted,
    update: updated,
    dryRun,
  };
}
