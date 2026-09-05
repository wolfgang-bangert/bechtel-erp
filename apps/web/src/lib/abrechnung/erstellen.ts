/**
 * Wochen-Abrechnung gegenüber OnlinePrinters: sammelt alle Portal-Aufträge mit
 * Versanddatum in der KW, die noch keiner Abrechnung zugeordnet sind, und legt
 * je Auftrag eine abrechnung_position an.
 *
 *   berechnet = false ODER ist_rekla  → 0-€-Zeile (Nachweis; Betrag später von
 *   Hand setzbar, z.B. Teilschuld bei Reklamation).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchOnePreis } from "@/lib/preise/match";

/** Montag (00:00) und Sonntag der ISO-Kalenderwoche als YYYY-MM-DD. */
export function isoWeekRange(jahr: number, kw: number): { von: string; bis: string } {
  // 4. Januar liegt immer in KW 1
  const jan4 = new Date(Date.UTC(jahr, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const montag = new Date(week1Monday);
  montag.setUTCDate(week1Monday.getUTCDate() + (kw - 1) * 7);
  const sonntag = new Date(montag);
  sonntag.setUTCDate(montag.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { von: iso(montag), bis: iso(sonntag) };
}

export type AbrechnungResult = {
  abrechnung_id: string;
  jahr: number;
  kw: number;
  von: string;
  bis: string;
  positionen: number;
  rekla: number;
  ohne_preis: number;
  summe_netto: number;
};

export async function erstelleAbrechnung(
  sb: SupabaseClient,
  jahr: number,
  kw: number,
): Promise<AbrechnungResult> {
  const { von, bis } = isoWeekRange(jahr, kw);

  const { data: existing } = await sb
    .from("abrechnung")
    .select("id, status")
    .eq("jahr", jahr)
    .eq("kw", kw)
    .maybeSingle();
  if (existing?.status === "festgeschrieben")
    throw new Error(`KW ${kw}/${jahr} ist bereits festgeschrieben`);

  let abrechnungId = existing?.id as string | undefined;
  if (!abrechnungId) {
    const { data, error } = await sb
      .from("abrechnung")
      .insert({ jahr, kw, von, bis })
      .select("id")
      .single();
    if (error) throw new Error(`abrechnung: ${error.message}`);
    abrechnungId = data.id as string;
  }

  const { data: ordersHead, error: oErr } = await sb
    .from("portal_order")
    .select("id, preis_quelle")
    .gte("versand_datum", von)
    .lte("versand_datum", bis)
    .is("abrechnung_id", null);
  if (oErr) throw new Error(oErr.message);

  // Preis je Auftrag am KW-Versandstand neu ermitteln (außer manuell gesetzt).
  for (const o of ordersHead ?? []) {
    if (o.preis_quelle === "manuell") continue;
    try {
      await matchOnePreis(sb, o.id as string);
    } catch {
      /* Treffer optional – 0-€-Zeile bzw. manuell */
    }
  }

  const { data: orders } = await sb
    .from("portal_order")
    .select(
      "id, external_reference, description, quantity, preis_netto, berechnet, ist_rekla, rekla_vermerk, resolve_result",
    )
    .in("id", (ordersHead ?? []).map((o) => o.id as string));

  let rekla = 0;
  let ohnePreis = 0;
  let summe = 0;

  for (const o of orders ?? []) {
    const rr = (o.resolve_result ?? null) as { gruppe?: string; attribute?: Record<string, unknown> } | null;
    const attr = rr?.attribute ?? {};
    const nichtBerechnen = o.berechnet === false || o.ist_rekla === true;
    const betrag = nichtBerechnen ? 0 : Number(o.preis_netto ?? 0);
    if (o.ist_rekla) rekla++;
    if (!nichtBerechnen && (o.preis_netto == null || Number(o.preis_netto) === 0)) ohnePreis++;

    const { error } = await sb.from("abrechnung_position").insert({
      abrechnung_id: abrechnungId,
      portal_order_id: o.id,
      referenz: o.external_reference,
      bezeichnung: o.description,
      kategorie: rr?.gruppe ?? null,
      format: (attr.format as string | undefined) ?? null,
      blatt: attr.blatt != null ? Number(attr.blatt) : null,
      auflage: Number(o.quantity) || null,
      preis_netto: o.preis_netto ?? null,
      betrag_netto: betrag,
      ist_rekla: o.ist_rekla ?? false,
      rekla_vermerk: o.rekla_vermerk ?? null,
      manuell: false,
    });
    if (error) throw new Error(`position ${o.external_reference}: ${error.message}`);

    await sb.from("portal_order").update({ abrechnung_id: abrechnungId }).eq("id", o.id);
    summe += betrag;
  }

  summe = Math.round(summe * 100) / 100;
  await sb.from("abrechnung").update({ summe_netto: summe }).eq("id", abrechnungId);

  return {
    abrechnung_id: abrechnungId,
    jahr,
    kw,
    von,
    bis,
    positionen: orders?.length ?? 0,
    rekla,
    ohne_preis: ohnePreis,
    summe_netto: summe,
  };
}

/** summe_netto einer Abrechnung aus ihren Positionen neu berechnen. */
export async function abrechnungNeuSummieren(sb: SupabaseClient, abrechnungId: string): Promise<number> {
  const { data } = await sb
    .from("abrechnung_position")
    .select("betrag_netto")
    .eq("abrechnung_id", abrechnungId);
  const summe = Math.round((data ?? []).reduce((a, p) => a + Number(p.betrag_netto ?? 0), 0) * 100) / 100;
  await sb.from("abrechnung").update({ summe_netto: summe }).eq("id", abrechnungId);
  return summe;
}
