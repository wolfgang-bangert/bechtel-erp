import { supabase } from "./supabase";
import { fetchKeylineOrganizations, type KeylineOrganization } from "./keyline";

type Options = { dryRun?: boolean };

type OrgFields = {
  name: string;
  relation: "customer" | "supplier" | "both";
  customer_segment: "akzidenz";
  vat_id: string | null;
  tax_country: string;
  email: string | null;
  customer_number: string | null;
  supplier_number: string | null;
};

type RefMeta = {
  keyline_reference: string | null;
  keyline_debitor: string | null;
  keyline_creditor: string | null;
  preferred_locale: string | null;
};

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function countryFromVatId(vatId: string | null): string {
  const v = vatId?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}/.test(v) ? v.slice(0, 2) : "DE";
}

function mapRelation(o: KeylineOrganization): OrgFields["relation"] {
  const cred = !!o.creditor_identifier?.trim();
  const deb = !!o.debitor_identifier?.trim();
  if (cred && deb) return "both";
  if (cred) return "supplier";
  return "customer";
}

function refMeta(o: KeylineOrganization): RefMeta {
  return {
    keyline_reference: o.reference?.trim() || null,
    keyline_debitor: o.debitor_identifier?.trim() || null,
    keyline_creditor: o.creditor_identifier?.trim() || null,
    preferred_locale: o.preferred_locale?.trim() || null,
  };
}

/** external_id (Keyline-ID als String) -> organization_id */
async function loadExistingRefs(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("organization_external_ref")
      .select("external_id, organization_id")
      .eq("system", "keyline")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`organization_external_ref lesen: ${error.message}`);
    for (const r of data ?? []) map.set(r.external_id as string, r.organization_id as string);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

/**
 * Bereits vergebene Debitoren-/Kreditorennummern -> "Eigentümer" (Keyline-extId,
 * sonst "org:<uuid>"). Damit werden Kollisionen erkannt und ein Neu-Import
 * behält seine eigene Nummer.
 */
async function loadUsedNumbers(refMap: Map<string, string>) {
  const orgIdToExtId = new Map<string, string>();
  for (const [extId, orgId] of refMap) orgIdToExtId.set(orgId, extId);

  const customer = new Map<string, string>();
  const supplier = new Map<string, string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("organization")
      .select("id, customer_number, supplier_number")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`organization lesen: ${error.message}`);
    for (const r of data ?? []) {
      const owner = orgIdToExtId.get(r.id as string) ?? `org:${r.id}`;
      if (r.customer_number) customer.set(r.customer_number as string, owner);
      if (r.supplier_number) supplier.set(r.supplier_number as string, owner);
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { customer, supplier };
}

export async function syncKeylineOrganizations(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const nowIso = () => new Date().toISOString();

  const existing = await loadExistingRefs();
  const used = dryRun
    ? { customer: new Map<string, string>(), supplier: new Map<string, string>() }
    : await loadUsedNumbers(existing);

  const conflicts: string[] = [];

  /** Nummer nur zurückgeben, wenn frei oder bereits dieser extId zugeordnet. */
  function claimNumber(
    value: string | null,
    extId: string,
    pool: Map<string, string>,
    kind: string,
  ): string | null {
    if (!value) return null;
    const owner = pool.get(value);
    if (owner && owner !== extId) {
      conflicts.push(`Keyline ${extId}: ${kind} ${value} bereits von ${owner} belegt — nicht übernommen`);
      return null;
    }
    pool.set(value, extId);
    return value;
  }

  const toCreate: { extId: string; fields: OrgFields; meta: RefMeta }[] = [];
  const toUpdate: { orgId: string; extId: string; fields: OrgFields; meta: RefMeta }[] = [];
  let seen = 0;
  let maxUpdatedAt = "";

  await fetchKeylineOrganizations(async (rows, meta) => {
    for (const o of rows) {
      seen += 1;
      if (o.updated_at > maxUpdatedAt) maxUpdatedAt = o.updated_at;
      const extId = String(o.id);
      const m = refMeta(o);

      const fields: OrgFields = {
        name: o.name?.trim() || `Keyline ${o.id}`,
        relation: mapRelation(o),
        customer_segment: "akzidenz",
        vat_id: o.tax_identifier?.trim() || null,
        tax_country: countryFromVatId(o.tax_identifier),
        email: (o.email || o.accounting_email)?.trim() || null,
        customer_number: claimNumber(m.keyline_debitor, extId, used.customer, "Debitor"),
        supplier_number: claimNumber(m.keyline_creditor, extId, used.supplier, "Kreditor"),
      };

      const orgId = existing.get(extId);
      if (orgId) toUpdate.push({ orgId, extId, fields, meta: m });
      else toCreate.push({ extId, fields, meta: m });
    }
    process.stdout.write(`\r  geladen: Seite ${meta.page}, ${seen}/${meta.total}   `);
  });
  process.stdout.write("\n");

  if (dryRun) {
    return {
      seen,
      created: toCreate.length,
      updated: toUpdate.length,
      conflicts,
      dryRun,
    };
  }

  let created = 0;
  let updated = 0;

  for (const part of chunk(toCreate, 100)) {
    const { data, error } = await supabase
      .from("organization")
      .insert(part.map((p) => p.fields))
      .select("id");
    if (error) throw new Error(`organization einfügen: ${error.message}`);
    if (!data || data.length !== part.length) {
      throw new Error("Insert lieferte unerwartete Zeilenzahl zurück");
    }
    const refs = part.map((p, i) => ({
      organization_id: (data[i] as { id: string }).id,
      system: "keyline",
      external_id: p.extId,
      is_authoritative: true,
      synced_at: nowIso(),
      metadata: p.meta,
    }));
    const { error: refErr } = await supabase.from("organization_external_ref").insert(refs);
    if (refErr) throw new Error(`organization_external_ref einfügen: ${refErr.message}`);
    created += part.length;
    process.stdout.write(`\r  geschrieben: neu ${created}, aktualisiert ${updated}   `);
  }

  for (const part of chunk(toUpdate, 100)) {
    const { error } = await supabase
      .from("organization")
      .upsert(
        part.map((p) => ({ id: p.orgId, ...p.fields })),
        { onConflict: "id" },
      );
    if (error) throw new Error(`organization aktualisieren: ${error.message}`);

    const { error: e2 } = await supabase.from("organization_external_ref").upsert(
      part.map((p) => ({
        system: "keyline",
        external_id: p.extId,
        organization_id: p.orgId,
        synced_at: nowIso(),
        metadata: p.meta,
      })),
      { onConflict: "system,external_id" },
    );
    if (e2) throw new Error(`organization_external_ref aktualisieren: ${e2.message}`);
    updated += part.length;
    process.stdout.write(`\r  geschrieben: neu ${created}, aktualisiert ${updated}   `);
  }
  process.stdout.write("\n");

  const { error: stErr } = await supabase.from("external_sync_state").upsert(
    {
      system: "keyline",
      resource: "organizations",
      last_run_at: startedAt.toISOString(),
      last_cursor: maxUpdatedAt || null,
      last_status: "ok",
      error: conflicts.length ? `${conflicts.length} Nummern-Kollisionen` : null,
      updated_at: nowIso(),
    },
    { onConflict: "system,resource" },
  );
  if (stErr) throw new Error(`external_sync_state schreiben: ${stErr.message}`);

  return { seen, created, updated, conflicts, dryRun };
}
