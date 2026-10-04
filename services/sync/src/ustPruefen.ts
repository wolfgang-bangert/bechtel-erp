import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { pruefeUst, type UstTaxCode } from "./ustCheck";
import type { Extracted } from "./extractIncoming";

/* --------------------------------------------------------------------------
 * USt-Prüfung für bereits erkannte Mail-/Upload-Belege nachziehen - OHNE neuen
 * KI-Aufruf, aus der gespeicherten Extraktion (extraction jsonb). Betroffen:
 * Status "extracted", nicht aus BB (dort kommt der Schlüssel aus der Buchung),
 * und seit der Erkennung nicht vom Nutzer gespeichert (sonst würden manuelle
 * Änderungen überschrieben - die werden nur gezählt).
 * -------------------------------------------------------------------------- */
export async function ustPruefen({ dryRun }: { dryRun: boolean }) {
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

  const orgInfo = new Map(
    (
      await pagedSelect<{ id: string; vat_id: string | null; foreign_supply_kind: string | null }>(
        "organization",
        "id, vat_id, foreign_supply_kind",
      )
    ).map((o) => [o.id, o]),
  );

  const docs = await pagedSelect<{
    id: string;
    doc_number: string | null;
    supplier_name: string | null;
    tax_code_id: string | null;
    extraction: (Extracted & { _ust?: unknown; _vorkontierung?: { tax_code_id?: string } }) | null;
    extracted_at: string | null;
    updated_at: string;
    supplier_organization_id: string | null;
    dedup_key: string;
  }>(
    "incoming_document",
    "id, doc_number, supplier_name, tax_code_id, extraction, extracted_at, updated_at, supplier_organization_id, dedup_key",
    ["status", "extracted"],
  );

  const out = { geprueft: 0, sicher: 0, vorschlag: 0, geaendert: 0, manuellBearbeitet: 0, details: [] as string[] };
  for (const d of docs) {
    if (d.dedup_key.startsWith("bb:") || !d.extraction) continue;
    const ex = d.extraction;
    if (ex.doc_type === "payment_advice" || ex.doc_type === "dunning") continue;
    const edited =
      d.extracted_at != null && new Date(d.updated_at).getTime() - new Date(d.extracted_at).getTime() > 60_000;
    const org = d.supplier_organization_id ? orgInfo.get(d.supplier_organization_id) : undefined;
    const m = /^[A-Za-z]{2}/.exec((org?.vat_id ?? "").replace(/\s/g, ""));
    const v = pruefeUst(ex, {
      codes: taxCodes,
      supplierCountry: m ? m[0].toUpperCase() : null,
      supplierKind: (org?.foreign_supply_kind as "service" | "goods" | null) ?? null,
    });
    // Vom Nutzer bearbeitete Belege nicht anfassen - außer die USt-Prüfung ist noch offen
    // ("vorschlag") und trifft jetzt eine feste Regel ("sicher", z.B. USD-Rechnung = §13b).
    const ustOffen = (ex._ust as { status?: string } | undefined)?.status === "vorschlag";
    if (edited && !(ustOffen && v.status === "sicher")) {
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
    if (dryRun) continue;
    await supabase.from("incoming_document").update({
      tax_code_id: v.status === "sicher" ? v.tax_code_id : null,
      extraction: { ...ex, _ust: v },
    }).eq("id", d.id);
    const { data: items } = await supabase.from("incoming_document_item").select("id, tax_rate").eq("incoming_document_id", d.id);
    for (const it of items ?? []) {
      await supabase.from("incoming_document_item").update({
        tax_code_id: v.status === "sicher" ? (stdByRate(it.tax_rate) ?? v.tax_code_id) : null,
      }).eq("id", it.id);
    }
  }
  return out;
}
