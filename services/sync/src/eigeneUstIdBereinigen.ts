import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { loadOwnVatId } from "./ustCheck";

/* --------------------------------------------------------------------------
 * Bereinigt Altlasten durch die eigene USt-IdNr.: Sie stand bei Organisationen und wurde
 * von der KI gelegentlich als Lieferanten-USt-IdNr. gelesen, wodurch Belege an die falsche
 * Organisation gehängt wurden.
 *  1. Organisationen mit der eigenen USt-IdNr.: Nummer entfernen.
 *  2. Belege an solchen Organisationen: auf die Organisation mit dem Lieferantennamen umhängen
 *     (nur bei eindeutigem Namenstreffer), sonst Verknüpfung lösen.
 *  3. Belege mit der eigenen USt-IdNr. als Lieferanten-USt-IdNr.: Feld leeren.
 *  Belege, bei denen der Lieferant die eigene Firma ist, bleiben unangetastet (nur Meldung).
 * -------------------------------------------------------------------------- */
export async function eigeneUstIdBereinigen({ dryRun }: { dryRun: boolean }) {
  const own = await loadOwnVatId();
  if (!own) throw new Error("Eigene USt-IdNr. im Firmenprofil nicht gefunden");
  const norm = (v: string | null) => (v ?? "").replace(/\s/g, "").toUpperCase();

  const orgs = await pagedSelect<{ id: string; name: string; vat_id: string | null }>("organization", "id, name, vat_id");
  const badOrgs = orgs.filter((o) => norm(o.vat_id) === own);
  const badIds = new Set(badOrgs.map((o) => o.id));

  const docs = await pagedSelect<{
    id: string;
    doc_number: string | null;
    supplier_name: string | null;
    supplier_vat_id: string | null;
    supplier_organization_id: string | null;
    status: string;
  }>("incoming_document", "id, doc_number, supplier_name, supplier_vat_id, supplier_organization_id, status");

  const ownName = (await supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle()).data?.value as
    | { name?: string; legal_name?: string }
    | null;
  const isOwnCompany = (n: string | null) =>
    !!n && [ownName?.name, ownName?.legal_name].filter(Boolean).some((x) => norm(x!).replace(/[^A-Z0-9]/g, "") === norm(n).replace(/[^A-Z0-9]/g, ""));

  const out = {
    dryRun,
    organisationenBereinigt: badOrgs.map((o) => o.name),
    belegeUmgehaengt: [] as string[],
    belegeVerknuepfungGeloest: [] as string[],
    belegeUstIdGeleert: 0,
    eigeneFirmaBelege: [] as string[],
  };

  const byName = (name: string) => {
    const n = norm(name).replace(/[^A-Z0-9]/g, "");
    return orgs.filter((o) => !badIds.has(o.id) && norm(o.name).replace(/[^A-Z0-9]/g, "") === n);
  };

  for (const d of docs) {
    const touchesBadOrg = d.supplier_organization_id != null && badIds.has(d.supplier_organization_id);
    const hasOwnVat = norm(d.supplier_vat_id) === own;
    if (!touchesBadOrg && !hasOwnVat) continue;
    if (isOwnCompany(d.supplier_name)) {
      out.eigeneFirmaBelege.push(`${d.doc_number ?? d.id.slice(0, 8)} [${d.status}]`);
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (hasOwnVat) {
      patch.supplier_vat_id = null;
      out.belegeUstIdGeleert++;
    }
    if (touchesBadOrg) {
      const cand = byName(d.supplier_name ?? "");
      if (cand.length === 1) {
        patch.supplier_organization_id = cand[0].id;
        out.belegeUmgehaengt.push(`${d.supplier_name} ${d.doc_number ?? ""} -> ${cand[0].name}`);
      } else {
        patch.supplier_organization_id = null;
        out.belegeVerknuepfungGeloest.push(`${d.supplier_name} ${d.doc_number ?? ""} (${cand.length} Namenstreffer)`);
      }
    }
    if (!dryRun) {
      const { error } = await supabase.from("incoming_document").update(patch).eq("id", d.id);
      if (error) throw new Error(error.message);
    }
  }

  if (!dryRun && badOrgs.length) {
    const { error } = await supabase.from("organization").update({ vat_id: null }).in("id", [...badIds]);
    if (error) throw new Error(error.message);
  }
  return out;
}
