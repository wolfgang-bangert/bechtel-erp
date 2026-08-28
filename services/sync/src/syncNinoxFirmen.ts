import { supabase } from "./supabase";
import { env } from "./env";
import { fetchNinoxRecords, type NinoxRecord } from "./ninox";

type Options = { dryRun?: boolean };

type OrgFields = {
  name: string;
  legal_name: string | null;
  relation: "customer" | "supplier" | "both";
  vat_id: string | null;
  tax_country: string;
  email: string | null;
  notes: string | null;
};

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const clean = (v: unknown): string =>
  str(v).replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
const numStr = (v: unknown): string | null => {
  const s = str(v);
  return s && s !== "0" ? s : null;
};

function countryFromVat(vat: string | null): string {
  const v = (vat ?? "").toUpperCase();
  return /^[A-Z]{2}/.test(v) ? v.slice(0, 2) : "DE";
}

function relationFrom(firmentyp: unknown): OrgFields["relation"] {
  const t = (Array.isArray(firmentyp) ? firmentyp.join(",") : str(firmentyp)).toLowerCase();
  const k = t.includes("kunde");
  const l = t.includes("lieferant");
  if (k && l) return "both";
  if (l && !k) return "supplier";
  return "customer";
}

function keylineOrgIdOf(f: Record<string, unknown>): number {
  const direct = Number(f["keylineOrgId"] ?? 0);
  if (direct > 0) return direct;
  try {
    const j = JSON.parse(str(f["res_antwort"]) || "{}");
    return Number(j.id_keyline ?? 0) || 0;
  } catch {
    return 0;
  }
}

type Parsed = {
  ninoxId: number;
  extId: string;
  keylineOrgId: number;
  debitor: string | null;
  kreditor: string | null;
  vatId: string | null;
  fields: OrgFields;
  meta: Record<string, unknown>;
};

function parse(rec: NinoxRecord): Parsed {
  const f = rec.fields;
  const vatId = str(f["UST-ID"]) || null;
  const name = clean(f["Name oder Firma"]) || `Ninox ${rec.id}`;
  return {
    ninoxId: rec.id,
    extId: `L:${rec.id}`,
    keylineOrgId: keylineOrgIdOf(f),
    debitor: numStr(f["Debitorennummer"]),
    kreditor: numStr(f["Kreditorennummer"]),
    vatId,
    fields: {
      name,
      legal_name: clean(f["Name oder Firma Zusatz"]) || null,
      relation: relationFrom(f["Firmentyp_"]),
      vat_id: vatId,
      tax_country: countryFromVat(vatId),
      email: str(f["E-Mail"]) || null,
      notes: str(f["Bemerkung Kunde intern"]) || null,
    },
    meta: {
      ninox_kundennummer: str(f["Kunden Nummer"]) || null,
      ninox_quelle: str(f["Quelle"]) || null,
      keyline_org_id: keylineOrgIdOf(f) || null,
      keyline_referenz: str(f["Keyline Referenz"]) || null,
      invoice_email: str(f["abweichende Mail für Rechnungsversand"]) || null,
      steuernummer: str(f["Steuernummer"]) || null,
      iban: str(f["IBAN"]) || null,
      strasse: str(f["Straße"]) || null,
      plz: str(f["Postleitzahl_old"]) || null,
      ort: str(f["Ort_old"]) || null,
    },
  };
}

/* ---- Lookups aus Supabase ---- */
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

export async function syncNinoxFirmen(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const nowIso = () => new Date().toISOString();

  // Zuordnungen
  const refs = await pagedSelect<{
    system: string;
    external_id: string;
    organization_id: string;
  }>("organization_external_ref", "system, external_id, organization_id");
  const keylineExtToOrg = new Map<string, string>();
  const ninoxExtToOrg = new Map<string, string>();
  const orgHasKeyline = new Set<string>();
  for (const r of refs) {
    if (r.system === "keyline") {
      keylineExtToOrg.set(r.external_id, r.organization_id);
      orgHasKeyline.add(r.organization_id);
    } else if (r.system === "ninox") {
      ninoxExtToOrg.set(r.external_id, r.organization_id);
    }
  }

  const orgs = await pagedSelect<{
    id: string;
    vat_id: string | null;
    customer_number: string | null;
    supplier_number: string | null;
  }>("organization", "id, vat_id, customer_number, supplier_number");
  const vatToOrg = new Map<string, string>();
  const custNoToOrg = new Map<string, string>();
  const custNoOwner = new Map<string, string>();
  const supNoOwner = new Map<string, string>();
  const orgHasCustNo = new Set<string>();
  const orgHasSupNo = new Set<string>();
  for (const o of orgs) {
    if (o.vat_id) vatToOrg.set(o.vat_id.toUpperCase(), o.id);
    if (o.customer_number) {
      custNoToOrg.set(o.customer_number, o.id);
      custNoOwner.set(o.customer_number, o.id);
      orgHasCustNo.add(o.id);
    }
    if (o.supplier_number) {
      supNoOwner.set(o.supplier_number, o.id);
      orgHasSupNo.add(o.id);
    }
  }

  const conflicts: string[] = [];
  function claim(
    value: string | null,
    orgId: string,
    owner: Map<string, string>,
    kind: string,
    extId: string,
  ): string | null {
    if (!value) return null;
    const cur = owner.get(value);
    if (cur && cur !== orgId) {
      conflicts.push(`Ninox ${extId}: ${kind} ${value} bereits von anderer Org belegt — nicht übernommen`);
      return null;
    }
    owner.set(value, orgId);
    return value;
  }

  // Records laden + einordnen
  const toCreate: Parsed[] = [];
  const toMerge: { p: Parsed; orgId: string }[] = [];
  let seen = 0;
  let matchedKeyline = 0;
  let matchedNumber = 0;
  let matchedVat = 0;

  await fetchNinoxRecords(env.ninox.customerTableId(), async (rows, meta) => {
    for (const rec of rows) {
      seen += 1;
      const p = parse(rec);
      let orgId =
        ninoxExtToOrg.get(p.extId) ??
        (p.keylineOrgId ? keylineExtToOrg.get(String(p.keylineOrgId)) : undefined);
      if (orgId && !ninoxExtToOrg.has(p.extId) && p.keylineOrgId) matchedKeyline += 1;

      if (!orgId && p.debitor && custNoToOrg.has(p.debitor)) {
        orgId = custNoToOrg.get(p.debitor);
        matchedNumber += 1;
      }
      if (!orgId && p.vatId && vatToOrg.has(p.vatId.toUpperCase())) {
        orgId = vatToOrg.get(p.vatId.toUpperCase());
        matchedVat += 1;
      }

      if (orgId) toMerge.push({ p, orgId });
      else toCreate.push(p);
    }
    process.stdout.write(`\r  geladen: ${meta.loaded} (Seite ${meta.page})   `);
  });
  process.stdout.write("\n");

  if (dryRun) {
    return {
      seen,
      create: toCreate.length,
      merge: toMerge.length,
      matchedKeyline,
      matchedNumber,
      matchedVat,
      conflicts,
      dryRun,
    };
  }

  let created = 0;
  let merged = 0;

  // Neue Kalenderkunden (Ninox führend)
  for (const part of chunk(toCreate, 100)) {
    const payloads = part.map((p) => ({
      ...p.fields,
      customer_segment: "kalender",
    }));
    const { data, error } = await supabase
      .from("organization")
      .insert(payloads)
      .select("id");
    if (error) throw new Error(`organization einfügen: ${error.message}`);
    if (!data || data.length !== part.length) throw new Error("Insert-Zeilenzahl unerwartet");

    // Nummern nachtragen (mit Kollisionsschutz) + external_ref
    const refRows: Record<string, unknown>[] = [];
    for (let i = 0; i < part.length; i++) {
      const p = part[i];
      const id = (data[i] as { id: string }).id;
      const cn = claim(p.debitor, id, custNoOwner, "Debitor", p.extId);
      const sn = claim(p.kreditor, id, supNoOwner, "Kreditor", p.extId);
      if (cn || sn) {
        const { error: uErr } = await supabase
          .from("organization")
          .update({ customer_number: cn, supplier_number: sn })
          .eq("id", id);
        if (uErr) throw new Error(`Nummern setzen (${p.extId}): ${uErr.message}`);
      }
      refRows.push({
        organization_id: id,
        system: "ninox",
        external_id: p.extId,
        is_authoritative: true,
        synced_at: nowIso(),
        metadata: p.meta,
      });
    }
    const { error: rErr } = await supabase.from("organization_external_ref").insert(refRows);
    if (rErr) throw new Error(`organization_external_ref einfügen: ${rErr.message}`);
    created += part.length;
    process.stdout.write(`\r  geschrieben: neu ${created}, verknüpft ${merged}   `);
  }

  // Zusammenführen mit bestehender Org (i. d. R. Keyline führend -> nur leere Felder füllen)
  for (const { p, orgId } of toMerge) {
    const keylineWins = orgHasKeyline.has(orgId);
    const patch: Record<string, unknown> = {
      customer_segment: keylineWins ? "mixed" : "kalender",
    };
    if (!keylineWins) {
      Object.assign(patch, p.fields);
    } else {
      // nur ergänzen, was fehlt
      if (p.fields.email) patch.email = undefined;
    }
    // leere-Felder-Ergänzung generisch
    const { data: cur, error: cErr } = await supabase
      .from("organization")
      .select("email, vat_id, notes, legal_name, tax_country")
      .eq("id", orgId)
      .single();
    if (cErr) throw new Error(`organization lesen (${orgId}): ${cErr.message}`);
    if (!cur.email && p.fields.email) patch.email = p.fields.email;
    if (!cur.vat_id && p.fields.vat_id) {
      patch.vat_id = p.fields.vat_id;
      patch.tax_country = p.fields.tax_country;
    }
    if (!cur.notes && p.fields.notes) patch.notes = p.fields.notes;
    if (!cur.legal_name && p.fields.legal_name) patch.legal_name = p.fields.legal_name;

    const cn = orgHasCustNo.has(orgId)
      ? null
      : claim(p.debitor, orgId, custNoOwner, "Debitor", p.extId);
    const sn = orgHasSupNo.has(orgId)
      ? null
      : claim(p.kreditor, orgId, supNoOwner, "Kreditor", p.extId);
    if (cn) {
      patch.customer_number = cn;
      orgHasCustNo.add(orgId);
    }
    if (sn) {
      patch.supplier_number = sn;
      orgHasSupNo.add(orgId);
    }

    const { error: uErr } = await supabase.from("organization").update(patch).eq("id", orgId);
    if (uErr) throw new Error(`organization aktualisieren (${orgId}): ${uErr.message}`);

    const { error: rErr } = await supabase.from("organization_external_ref").upsert(
      {
        organization_id: orgId,
        system: "ninox",
        external_id: p.extId,
        is_authoritative: !keylineWins,
        synced_at: nowIso(),
        metadata: p.meta,
      },
      { onConflict: "system,external_id" },
    );
    if (rErr) throw new Error(`organization_external_ref (${p.extId}): ${rErr.message}`);
    merged += 1;
    if (merged % 100 === 0) {
      process.stdout.write(`\r  geschrieben: neu ${created}, verknüpft ${merged}   `);
    }
  }
  process.stdout.write(`\r  geschrieben: neu ${created}, verknüpft ${merged}   \n`);

  const { error: stErr } = await supabase.from("external_sync_state").upsert(
    {
      system: "ninox",
      resource: "firmen",
      last_run_at: startedAt.toISOString(),
      last_cursor: null,
      last_status: "ok",
      error: conflicts.length ? `${conflicts.length} Nummern-Kollisionen` : null,
      updated_at: nowIso(),
    },
    { onConflict: "system,resource" },
  );
  if (stErr) throw new Error(`external_sync_state: ${stErr.message}`);

  return {
    seen,
    create: created,
    merge: merged,
    matchedKeyline,
    matchedNumber,
    matchedVat,
    conflicts,
    dryRun,
  };
}
