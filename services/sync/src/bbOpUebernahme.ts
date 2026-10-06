import { readFileSync } from "node:fs";
import { supabase } from "./supabase";

/**
 * Offene Eingangsrechnungen zum 31.12.2025 (Offene Posten laut BuchhaltungsButler) als Belege übernehmen, damit
 * Zahlungen in 2026 (Sammelüberweisungen, Lastschriften) den Belegen zugeordnet und im DATEV-Zahlungsexport
 * den Kreditoren zugeordnet werden können. Datum liegt in 2025: die Belege zählen nicht in der UStVA 2026 und nicht
 * im Eingangsrechnungs-Export 2026 (dort schon enthalten). Status "booked", ohne PDF (PDF-Nachtrag über bb:import-belege).
 * Daten: data/bb-op-2025.json (aus den BB-Buchungen abgeleitet).
 */

type Zeile = { buchung: string; betrag: number; satz: number | null; konto: string; text: string };
type Op = { kreditor: string; nr: string; datum: string; lieferant: string; offen: number; zeilen: Zeile[]; bezahlt2026: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function bbOpUebernahme(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  const ops = JSON.parse(readFileSync(new URL("../data/bb-op-2025.json", import.meta.url), "utf8")) as Op[];
  const { data: codes } = await supabase.from("tax_code").select("id, code").eq("direction", "input");
  const code = (satz: number | null) => codes?.find((c) => c.code === (satz != null && Math.round(satz) === 7 ? "VST7" : satz != null && satz > 0 ? "VST19" : "VST0"))?.id ?? null;

  const out = { gesamt: ops.length, angelegt: 0, summe: 0, vorhanden: 0, lieferantAngelegt: [] as string[], fehler: [] as string[], beispiele: [] as string[] };
  for (const op of ops) {
    const dedupKey = `bb:${op.zeilen[0]?.buchung}`;
    // Org über Kreditorennummer
    let { data: org } = await supabase.from("organization").select("id, name, vat_id").eq("supplier_number", op.kreditor).maybeSingle();
    // Sammelkreditor 70000 ("diverse"): keine Organisation, nur der Name am Beleg
    // Sonst Lieferant über den Namen finden, bevor ein neuer angelegt wird
    if (!org && op.kreditor !== "70000" && op.lieferant) {
      const kern = op.lieferant.replace(/\b(gmbh|mbh|kg|ag|co|ug|e\.k\.|ohg|se|&)\b/gi, "").replace(/[%,]/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
      if (kern.length > 3) {
        const { data: kand } = await supabase.from("organization").select("id, name, vat_id").eq("relation", "supplier").ilike("name", `%${kern}%`).limit(2);
        if (kand?.length === 1) org = kand[0];
      }
    }
    const vorhanden = await supabase
      .from("incoming_document")
      .select("id")
      .or(`dedup_key.eq.${dedupKey}${org ? `,and(doc_number.eq.${op.nr},supplier_organization_id.eq.${org.id})` : ""}`)
      .limit(1);
    if (vorhanden.data?.length) {
      out.vorhanden += 1;
      continue;
    }
    if (!org && op.kreditor !== "70000") {
      out.lieferantAngelegt.push(`${op.kreditor} ${op.lieferant}`);
      if (!dryRun) {
        const { data: neu, error } = await supabase
          .from("organization")
          .insert({ relation: "supplier", name: op.lieferant || `Kreditor ${op.kreditor}`, supplier_number: op.kreditor })
          .select("id, name, vat_id")
          .single();
        if (error || !neu) {
          out.fehler.push(`${op.nr}: Lieferant ${op.kreditor}: ${error?.message}`);
          continue;
        }
        org = neu;
      }
    }
    const items = op.zeilen.map((z) => {
      const net = z.satz && z.satz > 0 ? r2(z.betrag / (1 + z.satz / 100)) : z.betrag;
      return { z, net, tax: r2(z.betrag - net) };
    });
    const net = r2(items.reduce((s, i) => s + i.net, 0));
    const gross = r2(items.reduce((s, i) => s + i.z.betrag, 0));
    const tax = r2(gross - net);
    const gr = [...items].sort((a, b) => b.z.betrag - a.z.betrag)[0];
    out.angelegt += 1;
    out.summe = r2(out.summe + gross);
    if (out.beispiele.length < 8) out.beispiele.push(`${op.datum} ${op.nr} ${op.lieferant} ${gross} € (Konto ${gr.z.konto})`);
    if (dryRun) continue;
    const { data: doc, error } = await supabase
      .from("incoming_document")
      .insert({
        source: "api",
        doc_type: gross < 0 ? "credit_note" : "invoice",
        status: "booked",
        reviewed_at: new Date().toISOString(),
        dedup_key: dedupKey,
        supplier_organization_id: org?.id ?? null,
        supplier_name: org?.name ?? op.lieferant,
        supplier_vat_id: org?.vat_id ?? null,
        doc_number: op.nr || null,
        doc_date: op.datum,
        currency: "EUR",
        net_amount: Math.abs(net) * (gross < 0 ? 1 : 1),
        tax_amount: tax,
        gross_amount: gross,
        ledger_account: gr.z.konto,
        tax_code_id: code(gr.z.satz),
        notes: `Import aus BuchhaltungsButler (Buchungsnummer ${op.zeilen.map((z) => z.buchung).join("/")}) - Offener Posten zum 31.12.2025`,
      })
      .select("id")
      .single();
    if (error || !doc) {
      out.fehler.push(`${op.nr} ${op.lieferant}: ${error?.message ?? "kein Ergebnis"}`);
      continue;
    }
    const { error: iErr } = await supabase.from("incoming_document_item").insert(
      items.map((i, k) => ({
        incoming_document_id: doc.id,
        position: k + 1,
        description: i.z.text || null,
        tax_rate: i.z.satz ?? 0,
        net_amount: i.net,
        ledger_account: i.z.konto,
        tax_code_id: code(i.z.satz),
      })),
    );
    if (iErr) out.fehler.push(`${op.nr} Positionen: ${iErr.message}`);
  }
  return out;
}
