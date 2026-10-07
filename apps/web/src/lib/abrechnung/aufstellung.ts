/** Lädt die Wochen-Abrechnungen samt Positionen für die Aufstellung (PDF-Anlage). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AufstellungWoche } from "@werk/shared/pdf/aufstellung";

export async function ladeAufstellungWochen(
  sb: SupabaseClient,
  abrechnungIds: string[],
): Promise<{ wochen: AufstellungWoche[]; offen: boolean }> {
  if (!abrechnungIds.length) return { wochen: [], offen: false };

  const { data: abrs } = await sb
    .from("abrechnung")
    .select("id, jahr, kw, von, bis, status")
    .in("id", abrechnungIds)
    .order("jahr")
    .order("kw");
  const { data: pos } = await sb
    .from("abrechnung_position")
    .select("abrechnung_id, portal_order_id, referenz, bezeichnung, kategorie, format, auflage, preis_netto, betrag_netto, ist_rekla, rekla_vermerk")
    .in("abrechnung_id", abrechnungIds)
    .order("referenz");

  const orderIds = (pos ?? []).map((p) => p.portal_order_id).filter((x): x is string => !!x);
  const versand = new Map<string, string | null>();
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data } = await sb.from("portal_order").select("id, versand_datum").in("id", orderIds.slice(i, i + 200));
    for (const o of data ?? []) versand.set(o.id as string, (o.versand_datum as string | null) ?? null);
  }

  const wochen: AufstellungWoche[] = (abrs ?? []).map((a) => ({
    jahr: a.jahr as number,
    kw: a.kw as number,
    von: a.von as string,
    bis: a.bis as string,
    positionen: (pos ?? [])
      .filter((p) => p.abrechnung_id === a.id)
      .map((p) => ({
        referenz: p.referenz as string | null,
        bezeichnung: p.bezeichnung as string | null,
        merkmale: [p.kategorie, p.format, p.auflage ? `${p.auflage} Ex.` : null].filter(Boolean).join(" · ") || null,
        versand_datum: p.portal_order_id ? (versand.get(p.portal_order_id as string) ?? null) : null,
        listenpreis: p.preis_netto != null ? Number(p.preis_netto) : null,
        betrag: Number(p.betrag_netto),
        begruendung: (p.rekla_vermerk as string | null)?.trim() || null,
      })),
  }));
  return { wochen, offen: (abrs ?? []).some((a) => a.status !== "festgeschrieben") };
}
