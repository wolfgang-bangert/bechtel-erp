import { supabase } from "./supabase";
import { env } from "./env";
import { fetchNinoxRecords } from "./ninox";
import { splitStreet } from "./addr";

type Options = { dryRun?: boolean };

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}
const s = (v: unknown) => (v == null ? "" : String(v)).trim();

async function pagedSelect<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + size - 1);
    if (error) throw new Error(`${table} lesen: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

type Addr = {
  line1: string;
  line2: string | null;
  street: string | null;
  house_number: string | null;
  zip: string | null;
  city: string | null;
  country: string;
};

function buildAddress(f: Record<string, unknown>): Addr | null {
  let street = s(f["Straße"]);
  let zip = s(f["Postleitzahl_old"]);
  let city = s(f["Ort_old"]);
  let country = "DE";

  if (!street || !zip || !city) {
    try {
      const j = JSON.parse(s(f["res_antwort_hauptadresse"]) || "{}");
      street = street || s(j.street);
      zip = zip || s(j.postalCode);
      city = city || s(j.location);
      country = s(j.country_code_alpha2) || s(j.country) || country;
    } catch {
      /* ignore */
    }
  }

  if (!street && !zip && !city) return null;

  const addition = [f["additionalAddressInformation1"], f["additionalAddressInformation2"]]
    .map((x) => s(x))
    .filter(Boolean)
    .join(", ");

  const parts = splitStreet(street);
  return {
    line1: street || city || "—",
    line2: addition || null,
    street: parts.street,
    house_number: parts.houseNumber,
    zip: zip || null,
    city: city || null,
    country: (country || "DE").slice(0, 2).toUpperCase() || "DE",
  };
}

export async function syncNinoxAddresses(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const nowIso = () => new Date().toISOString();

  const refs = await pagedSelect<{
    system: string;
    external_id: string;
    organization_id: string;
  }>("organization_external_ref", "system, external_id, organization_id");
  const firmenToOrg = new Map<string, string>();
  for (const r of refs) if (r.system === "ninox") firmenToOrg.set(r.external_id, r.organization_id);

  const existing = await pagedSelect<{ external_id: string | null; organization_id: string }>(
    "address",
    "external_id, organization_id",
  );
  const existingExtIds = new Set(
    existing.map((a) => a.external_id).filter((x): x is string => !!x),
  );
  const orgHadAddress = new Set(existing.map((a) => a.organization_id));
  const willBeDefault = new Set<string>();

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];
  let seen = 0;
  let noOrg = 0;
  let noAddr = 0;

  await fetchNinoxRecords(env.ninox.customerTableId(), async (rows, meta) => {
    for (const rec of rows) {
      seen += 1;
      const orgId = firmenToOrg.get(`L:${rec.id}`);
      if (!orgId) {
        noOrg += 1;
        continue;
      }
      const a = buildAddress(rec.fields);
      if (!a) {
        noAddr += 1;
        continue;
      }
      const extId = `ninox:firmen-addr:${rec.id}`;
      const row = {
        organization_id: orgId,
        kind: "general",
        line1: a.line1,
        line2: a.line2,
        street: a.street,
        house_number: a.house_number,
        address_addition: a.line2,
        zip: a.zip,
        city: a.city,
        country: a.country,
        source: "ninox",
        external_id: extId,
      };
      if (existingExtIds.has(extId)) {
        toUpdate.push(row);
      } else {
        const isDefault = !orgHadAddress.has(orgId) && !willBeDefault.has(orgId);
        if (isDefault) willBeDefault.add(orgId);
        toInsert.push({ ...row, is_default: isDefault });
      }
    }
    process.stdout.write(`\r  geladen: ${meta.loaded} (Seite ${meta.page})   `);
  });
  process.stdout.write("\n");

  if (dryRun) {
    return { seen, insert: toInsert.length, update: toUpdate.length, noOrg, noAddr, dryRun };
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
    const { error } = await supabase.from("address").upsert(part, { onConflict: "external_id" });
    if (error) throw new Error(`address aktualisieren: ${error.message}`);
    updated += part.length;
    process.stdout.write(`\r  geschrieben: neu ${inserted}, aktualisiert ${updated}   `);
  }
  process.stdout.write("\n");

  const { error: stErr } = await supabase.from("external_sync_state").upsert(
    {
      system: "ninox",
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

  return { seen, insert: inserted, update: updated, noOrg, noAddr, dryRun };
}
