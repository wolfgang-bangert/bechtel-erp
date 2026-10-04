import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { getObjectBytes } from "./storage";
import { pruefeUst, loadOwnVatId, type UstTaxCode } from "./ustCheck";
import { MODEL, PROMPT, parseJson, type Extracted } from "./extractIncoming";

/* --------------------------------------------------------------------------
 * USt-Prüfung für bereits erkannte Mail-/Upload-Belege nachziehen - OHNE neuen
 * KI-Aufruf, aus der gespeicherten Extraktion (extraction jsonb). Betroffen:
 * Status "extracted", nicht aus BB (dort kommt der Schlüssel aus der Buchung),
 * und seit der Erkennung nicht vom Nutzer gespeichert (sonst würden manuelle
 * Änderungen überschrieben - die werden nur gezählt).
 * -------------------------------------------------------------------------- */
export async function ustPruefen({ dryRun, neuLesen = false }: { dryRun: boolean; neuLesen?: boolean }) {
  const client = neuLesen && !dryRun ? new Anthropic({ apiKey: env.anthropicKey() }) : null;
  const taxCodes: UstTaxCode[] = (
    await pagedSelect<{ id: string; code: string; rate: number; treatment: string; direction: string; is_active: boolean }>(
      "tax_code",
      "id, code, rate, treatment, direction, is_active",
    )
  )
    .filter((t) => t.direction === "input" && t.is_active)
    .map((t) => ({ id: t.id, code: t.code, rate: Number(t.rate), treatment: t.treatment }));
  const stdByRate = (rate: unknown) =>
    taxCodes.find((c) => c.treatment === "standard_de" && Math.round(c.rate) === Math.round(Number(rate)))?.id ?? null;

  const ownVatId = await loadOwnVatId();
  const orgInfo = new Map(
    (
      await pagedSelect<{ id: string; vat_id: string | null; foreign_supply_kind: string | null }>(
        "organization",
        "id, vat_id, foreign_supply_kind",
      )
    ).map((o) => [o.id, o]),
  );

  type Doc = {
    id: string;
    doc_number: string | null;
    supplier_name: string | null;
    status: string;
    tax_code_id: string | null;
    extraction: (Extracted & { _ust?: unknown; _vorkontierung?: { tax_code_id?: string } }) | null;
    extracted_at: string | null;
    updated_at: string;
    supplier_organization_id: string | null;
    dedup_key: string;
    pdf_storage_key: string | null;
  };
  const cols = "id, doc_number, supplier_name, status, tax_code_id, extraction, extracted_at, updated_at, supplier_organization_id, dedup_key, pdf_storage_key";
  // "reviewed" nur für Belege mit noch offener USt-Prüfung (siehe unten), sonst ist dort nichts zu tun.
  const docs = [
    ...(await pagedSelect<Doc>("incoming_document", cols, ["status", "extracted"])),
    ...(await pagedSelect<Doc>("incoming_document", cols, ["status", "reviewed"])),
  ];

  const out = { geprueft: 0, sicher: 0, vorschlag: 0, geaendert: 0, manuellBearbeitet: 0, neuGelesen: 0, details: [] as string[] };
  for (const d of docs) {
    if (d.dedup_key.startsWith("bb:") || !d.extraction) continue;
    let ex = d.extraction;
    let gelesen = false;
    if (ex.doc_type === "payment_advice" || ex.doc_type === "dunning") continue;
    const offen = (ex._ust as { status?: string } | undefined)?.status === "vorschlag";
    if (d.status === "reviewed" && !offen) continue;

    // Offene Belege, deren Extraktion noch keine USt-Angaben des Belegs ("vat_check") enthält, einmal neu
    // lesen - nur dieses Feld wird übernommen, Positionen/Beträge bleiben unberührt.
    if (neuLesen && offen && !("vat_check" in ex) && d.pdf_storage_key) {
      if (client) {
        try {
          const pdf = await getObjectBytes(d.pdf_storage_key);
          const res = await client.messages.create({
            model: MODEL,
            max_tokens: 16000,
            messages: [{ role: "user", content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
              { type: "text", text: PROMPT },
            ] }],
          });
          const tp = res.content.find((c) => c.type === "text");
          const neu = parseJson(tp && "text" in tp ? tp.text : "") as Extracted;
          ex = { ...ex, vat_check: neu.vat_check ?? null };
          gelesen = true;
          out.neuGelesen++;
        } catch (err) {
          out.details.push(`${d.supplier_name ?? "?"} ${d.doc_number ?? ""}: Neu-Lesen fehlgeschlagen (${err instanceof Error ? err.message.slice(0, 80) : err})`);
        }
      } else {
        out.neuGelesen++; // Probelauf: würde neu gelesen
      }
    }
    const edited =
      d.extracted_at != null && new Date(d.updated_at).getTime() - new Date(d.extracted_at).getTime() > 60_000;
    const org = d.supplier_organization_id ? orgInfo.get(d.supplier_organization_id) : undefined;
    const orgVat = (org?.vat_id ?? "").replace(/\s/g, "").toUpperCase();
    const m = /^[A-Za-z]{2}/.exec(orgVat && orgVat !== ownVatId ? orgVat : "");
    const v = pruefeUst(ex, {
      ownVatId,
      codes: taxCodes,
      supplierCountry: m ? m[0].toUpperCase() : null,
      supplierKind: (org?.foreign_supply_kind as "service" | "goods" | null) ?? null,
    });
    // Vom Nutzer bearbeitete Belege nicht anfassen - außer die USt-Prüfung ist noch offen
    // ("vorschlag") und trifft jetzt eine feste Regel ("sicher", z.B. USD-Rechnung = §13b).
    const ustOffen = offen;
    if (edited && !(ustOffen && v.status === "sicher")) {
      // Neu gelesene USt-Angaben trotzdem sichern (damit nicht bei jedem Lauf erneut gelesen wird);
      // Steuerschlüssel und Positionen bleiben wie vom Nutzer gesetzt.
      if (gelesen && !dryRun) await supabase.from("incoming_document").update({ extraction: { ...ex, _ust: v } }).eq("id", d.id);
      out.manuellBearbeitet++;
      continue;
    }
    out.geprueft++;
    out[v.status]++;
    const changed = (v.status === "sicher" ? v.tax_code_id : null) !== d.tax_code_id;
    if (changed) out.geaendert++;
    if (v.status === "vorschlag" || changed) {
      out.details.push(`${d.supplier_name ?? "?"} ${d.doc_number ?? ""}: ${v.status} ${v.tax_code ?? "-"} (${v.reason})${changed ? " [Schlüssel geändert]" : ""}`);
    }
    const codeTreatment = taxCodes.find((c) => c.id === v.tax_code_id)?.treatment;
    if (dryRun) continue;
    await supabase.from("incoming_document").update({
      tax_code_id: v.status === "sicher" ? v.tax_code_id : null,
      extraction: { ...ex, _ust: v },
    }).eq("id", d.id);
    const { data: items } = await supabase.from("incoming_document_item").select("id, tax_rate").eq("incoming_document_id", d.id);
    for (const it of items ?? []) {
      await supabase.from("incoming_document_item").update({
        tax_code_id:
          v.status !== "sicher"
            ? null
            : codeTreatment === "standard_de"
              ? (it.tax_rate != null && Number(it.tax_rate) === 0 ? null : (stdByRate(it.tax_rate) ?? v.tax_code_id))
              : v.tax_code_id,
      }).eq("id", it.id);
    }
  }
  return out;
}
