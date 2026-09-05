/**
 * Einen Portal-Auftrag mit der gültigen Preisliste verknüpfen.
 * Liste nach Versanddatum (Fallback Lieferdatum); Preis exakt über
 * Produktgruppe · Format · Blatt · Sorte · Farbigkeit · Auflage.
 * Spiegel-Logik zu services/sync/src/importPreise.ts (matchPreise).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const fmtKey = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/cm|mm/g, "").replace(/[\s×x,._-]/g, "");

function sorteKey(attr: Record<string, unknown>): string | null {
  const g = attr.grammatur_g;
  if (g == null) return null;
  return `${g}${/offset/i.test(String(attr.sorte ?? "")) ? "OFF" : ""}`;
}

export type MatchResult =
  | { ok: true; preis_netto: number; liste: string; spalten_key: string }
  | { ok: false; grund: string };

export async function matchOnePreis(sb: SupabaseClient, portalOrderId: string): Promise<MatchResult> {
  const { data: o, error } = await sb
    .from("portal_order")
    .select("id, quantity, versand_datum, deliver_date, resolve_result")
    .eq("id", portalOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) return { ok: false, grund: "Auftrag nicht gefunden" };

  const rr = (o.resolve_result ?? null) as { gruppe?: string; attribute?: Record<string, unknown> } | null;
  const datum =
    (o.versand_datum as string | null) ??
    (o.deliver_date ? String(o.deliver_date).slice(0, 10) : null);
  if (!rr?.gruppe) return { ok: false, grund: "Auftrag nicht aufgelöst (keine Produktgruppe)" };
  if (!datum) return { ok: false, grund: "kein Versand-/Lieferdatum" };

  const { data: listen } = await sb
    .from("preis_liste")
    .select("id, name, gueltig_ab, gueltig_bis")
    .eq("is_active", true)
    .lte("gueltig_ab", datum)
    .order("gueltig_ab", { ascending: false });
  const liste = (listen ?? []).find((l) => !l.gueltig_bis || (l.gueltig_bis as string) >= datum);
  if (!liste) return { ok: false, grund: `keine gültige Preisliste für ${datum}` };

  const attr = rr.attribute ?? {};
  const auflage = Number(o.quantity) || 0;
  const { data: kandidaten } = await sb
    .from("preis")
    .select("id, format, blatt, sorte, farbigkeit, preis_netto, spalten_key")
    .eq("liste_id", liste.id)
    .eq("produktgruppe", rr.gruppe)
    .eq("auflage", auflage);

  const fmt = fmtKey(String(attr.format ?? ""));
  const blatt = attr.blatt != null ? Number(attr.blatt) : attr.seiten != null ? Number(attr.seiten) : null;
  const sk = sorteKey(attr);
  const farb = attr.farbigkeit ? String(attr.farbigkeit) : null;

  const hit = (kandidaten ?? []).find((p) => {
    if (p.format && fmt && fmtKey(p.format as string) !== fmt) return false;
    if (p.blatt != null && blatt != null && Number(p.blatt) !== blatt) return false;
    if (p.sorte && sk && String(p.sorte) !== sk) return false;
    if (p.farbigkeit && farb && String(p.farbigkeit) !== farb) return false;
    return true;
  });

  if (!hit) {
    await sb.from("portal_order").update({ preis_quelle: "kein_treffer" }).eq("id", portalOrderId);
    return {
      ok: false,
      grund: `kein Preis in „${liste.name}" für ${rr.gruppe}/${attr.format ?? "?"}/${blatt ?? "?"}Bl/${sk ?? "?"}/${auflage}`,
    };
  }

  const preis = Math.round(Number(hit.preis_netto) * 100) / 100;
  await sb
    .from("portal_order")
    .update({ preis_id: hit.id, preis_netto: preis, preis_quelle: "auto" })
    .eq("id", portalOrderId);
  return { ok: true, preis_netto: preis, liste: liste.name as string, spalten_key: hit.spalten_key as string };
}
