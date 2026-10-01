/**
 * Laufende Sammelrechnung an Onlineprinters: jede festgeschriebene Wochen-
 * Abrechnung hängt eine Position an die aktuell offene Rechnung ("Druck-
 * aufträge KW … gem. Aufstellung"). Die Rechnung bleibt offen, bis sie
 * explizit abgeschlossen wird (siehe abrechnung/rechnung/[id]/actions.ts)
 * - das ist der Hebel für wöchentlich/monatlich, kein eigener Modus nötig.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const USTSATZ = 19;

/** invoice.net_total/tax_total/gross_total aus ihren invoice_item-Zeilen neu berechnen. */
export async function rechnungNeuSummieren(sb: SupabaseClient, invoiceId: string) {
  const { data } = await sb
    .from("invoice_item")
    .select("net_amount, tax_amount, gross_amount")
    .eq("invoice_id", invoiceId);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const net = round2((data ?? []).reduce((a, p) => a + Number(p.net_amount ?? 0), 0));
  const tax = round2((data ?? []).reduce((a, p) => a + Number(p.tax_amount ?? 0), 0));
  const gross = round2((data ?? []).reduce((a, p) => a + Number(p.gross_amount ?? 0), 0));
  await sb.from("invoice").update({ net_total: net, tax_total: tax, gross_total: gross }).eq("id", invoiceId);
  return { net, tax, gross };
}

/** Findet die aktuell offene Sammelrechnung einer Organisation, legt bei Bedarf eine neue an. */
export async function offeneRechnungFinden(
  sb: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data: existing } = await sb
    .from("invoice")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "offen")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await sb
    .from("invoice")
    .insert({ organization_id: organizationId, type: "collective", status: "offen" })
    .select("id")
    .single();
  if (error) throw new Error(`invoice anlegen: ${error.message}`);
  return data.id as string;
}

/** Hängt eine Wochen-Abrechnung als Position an die offene Onlineprinters-Sammelrechnung. */
export async function wochePositionHinzufuegen(
  sb: SupabaseClient,
  abrechnungId: string,
): Promise<{ invoice_id: string }> {
  const { data: abr, error: abrErr } = await sb
    .from("abrechnung")
    .select("jahr, kw, summe_netto")
    .eq("id", abrechnungId)
    .single();
  if (abrErr) throw new Error(abrErr.message);
  if (!abr.summe_netto || Number(abr.summe_netto) <= 0) {
    throw new Error("Abrechnung hat keine berechenbaren Positionen (Summe 0) - keine Rechnungszeile erzeugt");
  }

  const { data: portal, error: portalErr } = await sb
    .from("portal")
    .select("organization_id")
    .eq("code", "onlineprinters")
    .single();
  if (portalErr) throw new Error(portalErr.message);
  if (!portal.organization_id) throw new Error("Onlineprinters-Portal ist keiner Organisation zugeordnet");

  const { data: taxCode } = await sb.from("tax_code").select("id").eq("code", "UST19").maybeSingle();

  const invoiceId = await offeneRechnungFinden(sb, portal.organization_id as string);

  const { count } = await sb
    .from("invoice_item")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);

  const net = Math.round(Number(abr.summe_netto) * 100) / 100;
  const tax = Math.round(((net * USTSATZ) / 100) * 100) / 100;
  const gross = Math.round((net + tax) * 100) / 100;

  const { error: itemErr } = await sb.from("invoice_item").insert({
    invoice_id: invoiceId,
    position: (count ?? 0) + 1,
    description: `Druckaufträge KW ${abr.kw}/${abr.jahr} gem. Aufstellung`,
    abrechnung_id: abrechnungId,
    net_amount: net,
    tax_code_id: taxCode?.id ?? null,
    tax_amount: tax,
    gross_amount: gross,
  });
  if (itemErr) throw new Error(`invoice_item: ${itemErr.message}`);

  await rechnungNeuSummieren(sb, invoiceId);
  await sb.from("abrechnung").update({ invoice_id: invoiceId }).eq("id", abrechnungId);

  return { invoice_id: invoiceId };
}
