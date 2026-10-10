import { supabase } from "./supabase";
import { findeOderLegeAn, ladeEigene } from "./organisationFinden";

/**
 * Belege nach der PDF-Prüfung (belege:pdf-pruefen) nachbessern:
 *   1. Rechnungsnummern mit reinen Lesefehlern (0/O, 1/I/l) aus dem PDF übernehmen
 *   2. Amazon-Käufe (laut PDF über Amazon, auch Marktplatz-Händler) auf den Kreditor Amazon stellen
 *      (--amazon=75009); doppelte Amazon-Organisationen mit --verschmelzen=<Name|Name> vorher zusammenführen
 *   3. --pdf-verkaeufer=NR1,NR2: bei diesen Belegen den Lieferanten aus dem PDF übernehmen (finden/anlegen)
 * Erledigte Abweichungen werden aus pdf_pruefung entfernt. Verworfene Belege bleiben unberührt.
 */
type Options = { dryRun?: boolean; amazon?: string; verschmelzen?: string; pdfVerkaeufer?: string };

type Pruefung = { verkaeufer?: string | null; amazon?: boolean; rechnungsnummer?: string | null; abweichungen?: string[] } & Record<string, unknown>;

const lesefehlerNorm = (s: string) => s.replace(/\s+/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function org(wert: string) {
  const q = supabase.from("organization").select("id, name");
  const { data } = UUID.test(wert) ? await q.eq("id", wert) : /^\d{4,6}$/.test(wert) ? await q.eq("supplier_number", wert) : await q.eq("name", wert);
  if (!data || data.length !== 1) throw new Error(`Organisation „${wert}“: ${data?.length ?? 0} Treffer (genau 1 nötig)`);
  return data[0];
}

export async function belegeNachbessern(opts: Options = {}) {
  const { dryRun = false } = opts;
  const log: string[] = [];
  const amazon = opts.amazon ? await org(opts.amazon) : null;

  if (amazon) {
    // mehrere Organisationen mit | trennen (Namen enthalten oft Kommas)
    for (const w of (opts.verschmelzen ?? "").split("|").map((s) => s.trim()).filter(Boolean)) {
      const weg = await org(w);
      if (weg.id === amazon.id) continue;
      log.push(`verschmelzen: ${weg.name} → ${amazon.name}`);
      if (!dryRun) {
        const { error } = await supabase.rpc("merge_organization", { p_survivor: amazon.id, p_loser: weg.id, p_merged_by: null });
        if (error) throw new Error(`Verschmelzen ${weg.name}: ${error.message}`);
      }
    }
  }

  const docs: { id: string; doc_number: string | null; supplier_name: string | null; supplier_organization_id: string | null; pdf_pruefung: Pruefung }[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await supabase
      .from("incoming_document")
      .select("id, doc_number, supplier_name, supplier_organization_id, pdf_pruefung")
      .not("pdf_pruefung", "is", null)
      .neq("status", "rejected")
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    docs.push(...((data ?? []) as typeof docs));
    if (!data || data.length < 1000) break;
  }

  const pdfVerk = new Set((opts.pdfVerkaeufer ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const eigene = pdfVerk.size ? await ladeEigene() : null;
  const z = { nummer: 0, amazon: 0, verkaeufer: 0 };

  for (const d of docs) {
    const p = d.pdf_pruefung ?? {};
    const upd: Record<string, unknown> = {};
    let abw = [...(p.abweichungen ?? [])];

    // 1. Lesefehler in der Rechnungsnummer
    if (p.rechnungsnummer && d.doc_number && p.rechnungsnummer.replace(/\s+/g, "") !== d.doc_number.replace(/\s+/g, "") && lesefehlerNorm(p.rechnungsnummer) === lesefehlerNorm(d.doc_number)) {
      upd.doc_number = p.rechnungsnummer.replace(/\s+/g, "");
      abw = abw.filter((a) => !a.startsWith("Rechnungsnummer im PDF"));
      log.push(`${d.doc_number} → Nummer ${upd.doc_number} (Lesefehler)`);
      z.nummer++;
    }

    // 3. Lieferant aus dem PDF (ausdrücklich genannte Belege)
    if (d.doc_number && pdfVerk.has(d.doc_number) && p.verkaeufer && eigene) {
      const r = await findeOderLegeAn({ name: p.verkaeufer }, { herkunft: "eingangsrechnung", relation: "supplier", eigene, dryRun });
      if (r.id || dryRun) {
        if (r.id) upd.supplier_organization_id = r.id;
        upd.supplier_name = p.verkaeufer;
        abw = abw.filter((a) => !a.startsWith("Verkäufer im PDF"));
        log.push(`${d.doc_number}: ${d.supplier_name} → ${p.verkaeufer}${r.neu ? " (neu angelegt)" : ""}`);
        z.verkaeufer++;
      }
    } else if (amazon && p.amazon) {
      // 2. Amazon-Kauf (auch Marktplatz-Händler) → Kreditor Amazon; Verkäufer-Abweichung ist dann gewollt
      if (d.supplier_organization_id !== amazon.id) {
        upd.supplier_organization_id = amazon.id;
        upd.supplier_name = amazon.name;
        log.push(`${d.doc_number}: ${d.supplier_name} → ${amazon.name} (Verkäufer laut PDF: ${p.verkaeufer ?? "?"})`);
        z.amazon++;
      }
      abw = abw.filter((a) => !a.startsWith("Verkäufer im PDF"));
    }

    if ((p.abweichungen ?? []).length !== abw.length) upd.pdf_pruefung = { ...p, abweichungen: abw };
    if (!Object.keys(upd).length || dryRun) continue;
    const { error } = await supabase.from("incoming_document").update(upd).eq("id", d.id);
    if (error) throw new Error(`${d.doc_number}: ${error.message}`);
  }
  return { geprueft: docs.length, nummerKorrigiert: z.nummer, aufAmazon: z.amazon, verkaeuferAusPdf: z.verkaeufer, log, dryRun };
}
