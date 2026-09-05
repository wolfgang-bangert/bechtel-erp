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

/**
 * Spiralbooklet: Preis aus Komponenten aufbauen (Inhalt-Papier + optional
 * Umschlag / Cello / Deckblatt / Schlussblatt), je exakter Auflage.
 */
export async function spiralPreis(
  sb: SupabaseClient,
  listeId: string,
  format: string,
  attr: Record<string, unknown>,
  auflage: number,
): Promise<{ netto: number; aufbau: string } | null> {
  const { data: rows } = await sb
    .from("preis")
    .select("spalten_key, sorte, preis_netto")
    .eq("liste_id", listeId)
    .eq("kategorie", "Spiralbooklet")
    .eq("format", format)
    .eq("auflage", auflage);
  if (!rows?.length) return null;

  const P = (key: string, sub: string) =>
    Number(rows.find((r) => r.spalten_key === key && r.sorte === sub)?.preis_netto ?? 0);

  const seiten =
    Number(attr.seiten ?? (attr.blatt != null ? Number(attr.blatt) * 2 : 8)) || 8;
  const extra = Math.max(0, Math.ceil((seiten - 8) / 2));
  const g = Number(attr.grammatur_g) || 0;
  const offset = /offset/i.test(String(attr.sorte ?? ""));
  const ic = offset ? "inhalt_offset" : g >= 280 ? "inhalt_300" : "inhalt_135";

  const teile: string[] = [];
  let netto = P(ic, "8s") + extra * P(ic, "per2");
  teile.push(`${ic}${extra ? ` +${extra}×2S.` : ""}`);

  const ug = Number(attr.umschlag_g) || 0;
  if ([170, 250, 300].includes(ug)) {
    netto += P(`umschlag_${ug}`, "x");
    teile.push(`umschlag_${ug}`);
  }
  if (attr.cello === "matt" || attr.cello === "glanz") {
    netto += P("cello", "8s") + extra * P("cello", "per2");
    teile.push("cello");
  }
  if (attr.deckblatt === true) {
    netto += P("deckblatt", "x");
    teile.push("deckblatt");
  }
  const sbl = String(attr.schlussblatt ?? "");
  if (sbl === "folie") {
    netto += P("schlussblatt_folie", "x");
    teile.push("schlussblatt");
  } else if (sbl === "grau") {
    netto += P("karton_grau", "x");
    teile.push("karton_grau");
  } else if (sbl === "weiss") {
    netto += P("karton_weiss", "x");
    teile.push("karton_weiss");
  }

  return { netto: Math.round(netto * 100) / 100, aufbau: teile.join(" + ") };
}

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

  // Spiralbooklet: Preis aus Komponenten
  if (rr.gruppe === "DSP") {
    const sp = await spiralPreis(sb, liste.id, String(attr.format ?? ""), attr, auflage);
    if (!sp) {
      await sb.from("portal_order").update({ preis_quelle: "kein_treffer" }).eq("id", portalOrderId);
      return { ok: false, grund: `keine Spiralbooklet-Preise für ${attr.format ?? "?"}/${auflage}` };
    }
    await sb
      .from("portal_order")
      .update({ preis_id: null, preis_netto: sp.netto, preis_quelle: "auto" })
      .eq("id", portalOrderId);
    return { ok: true, preis_netto: sp.netto, liste: liste.name as string, spalten_key: sp.aufbau };
  }

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
