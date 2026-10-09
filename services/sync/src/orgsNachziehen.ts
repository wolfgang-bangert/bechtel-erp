import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { findeOderLegeAn, ladeEigene } from "./organisationFinden";

/**
 * Einmalig/bei Bedarf: Eingangsrechnungen mit erkanntem Lieferanten, aber ohne Organisation, nachträglich
 * zuordnen - vorhandene Organisation finden oder neu anlegen (angelegt_durch = 'eingangsrechnung').
 * Avis/Mahnungen/Sonstiges (status advice/dunning) und verworfene Belege bleiben außen vor.
 */
export async function orgsNachziehen(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  const eigene = await ladeEigene();
  const docs = (
    await pagedSelect<{ id: string; status: string; supplier_name: string | null; supplier_vat_id: string | null; supplier_organization_id: string | null }>(
      "incoming_document",
      "id, status, supplier_name, supplier_vat_id, supplier_organization_id",
    )
  ).filter(
    (d) => !d.supplier_organization_id && d.supplier_name?.trim() && !["advice", "dunning", "captured", "rejected", "duplicate"].includes(d.status),
  );

  let verknuepft = 0;
  let neu = 0;
  let ohne = 0;
  const neueNamen = new Set<string>();
  for (const d of docs) {
    // Anzeige-Zusatz für Marktplätze ("Händler (Amazon)") gehört nicht zum Lieferantennamen
    const name = d.supplier_name!.replace(/\s*\((amazon|ebay|otto|kaufland)[^)]*\)\s*$/i, "").trim();
    const r = await findeOderLegeAn(
      { name, vat_id: d.supplier_vat_id },
      { herkunft: "eingangsrechnung", relation: "supplier", eigene, dryRun },
    );
    if (r.neu) {
      neu++;
      neueNamen.add(name);
    }
    if (!r.id) {
      if (!r.neu) ohne++;
      continue;
    }
    verknuepft++;
    if (!dryRun) {
      const { error } = await supabase.from("incoming_document").update({ supplier_organization_id: r.id }).eq("id", d.id);
      if (error) throw new Error(`incoming_document ${d.id}: ${error.message}`);
    }
  }
  return { belegeOhneOrg: docs.length, verknuepft, neuAngelegt: dryRun ? neueNamen.size : neu, ohneTreffer: ohne, dryRun };
}
