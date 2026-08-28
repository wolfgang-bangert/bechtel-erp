import { supabase } from "./supabase";
import { fetchNinoxRecords } from "./ninox";

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

const PEOPLE_TABLE_ID = "ZB";

export async function syncNinoxPeople(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const nowIso = () => new Date().toISOString();

  // Ninox-Firmen-Ref -> organization_id
  const refs = await pagedSelect<{
    system: string;
    external_id: string;
    organization_id: string;
  }>("organization_external_ref", "system, external_id, organization_id");
  const firmenToOrg = new Map<string, string>();
  for (const r of refs) {
    if (r.system === "ninox") firmenToOrg.set(r.external_id, r.organization_id);
  }

  // bestehende Kontakte
  const contacts = await pagedSelect<{
    external_id: string | null;
    organization_id: string;
    is_primary: boolean;
  }>("contact", "external_id, organization_id, is_primary");
  const existingExtIds = new Set(
    contacts.map((c) => c.external_id).filter((x): x is string => !!x),
  );
  const orgHasPrimary = new Set(
    contacts.filter((c) => c.is_primary).map((c) => c.organization_id),
  );

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];
  let seen = 0;
  let orphans = 0;
  let empty = 0;

  await fetchNinoxRecords(PEOPLE_TABLE_ID, async (rows, meta) => {
    for (const rec of rows) {
      seen += 1;
      const f = rec.fields;
      const firmenRef = f["Firmen"];
      const firmenId = Array.isArray(firmenRef) ? firmenRef[0] : firmenRef;
      const orgId = firmenId != null ? firmenToOrg.get(`L:${firmenId}`) : undefined;
      if (!orgId) {
        orphans += 1;
        continue;
      }

      const first = s(f["Vorname"]);
      const last = s(f["Nachname"]);
      const email = s(f["E-Mail"]);
      if (!first && !last && !email) {
        empty += 1;
        continue;
      }

      const extId = `ninox:people:${rec.id}`;
      const row: Record<string, unknown> = {
        organization_id: orgId,
        first_name: first || "—",
        last_name: last || "—",
        email: email || null,
        phone: s(f["Telefon"]) || null,
        position: s(f["Abteilung"]) || null,
        source: "ninox",
        external_id: extId,
      };

      if (existingExtIds.has(extId)) {
        toUpdate.push(row);
      } else {
        const primary = !orgHasPrimary.has(orgId);
        if (primary) orgHasPrimary.add(orgId);
        toInsert.push({ ...row, is_primary: primary });
      }
    }
    process.stdout.write(`\r  geladen: ${meta.loaded} (Seite ${meta.page})   `);
  });
  process.stdout.write("\n");

  if (dryRun) {
    return { seen, insert: toInsert.length, update: toUpdate.length, orphans, empty, dryRun };
  }

  let inserted = 0;
  let updated = 0;
  for (const part of chunk(toInsert, 200)) {
    const { error } = await supabase.from("contact").insert(part);
    if (error) throw new Error(`contact einfügen: ${error.message}`);
    inserted += part.length;
    process.stdout.write(`\r  geschrieben: neu ${inserted}, aktualisiert ${updated}   `);
  }
  for (const part of chunk(toUpdate, 200)) {
    const { error } = await supabase
      .from("contact")
      .upsert(part, { onConflict: "external_id" });
    if (error) throw new Error(`contact aktualisieren: ${error.message}`);
    updated += part.length;
    process.stdout.write(`\r  geschrieben: neu ${inserted}, aktualisiert ${updated}   `);
  }
  process.stdout.write("\n");

  const { error: stErr } = await supabase.from("external_sync_state").upsert(
    {
      system: "ninox",
      resource: "people",
      last_run_at: startedAt.toISOString(),
      last_cursor: null,
      last_status: "ok",
      error: orphans ? `${orphans} ohne zugeordnete Firma` : null,
      updated_at: nowIso(),
    },
    { onConflict: "system,resource" },
  );
  if (stErr) throw new Error(`external_sync_state: ${stErr.message}`);

  return { seen, insert: inserted, update: updated, orphans, empty, dryRun };
}
