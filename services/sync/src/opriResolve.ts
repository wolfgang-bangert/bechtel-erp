/**
 * onlineprinters-Auflösung im Worker: alle bzw. die neuesten portal_order
 * auflösen und `resolve_result` zurückschreiben. Die eigentliche Logik liegt in
 * @werk/shared/opri (eine Quelle mit dem Web-Button „neu auflösen").
 */
import { supabase } from "./supabase";
import {
  loadResolveRefData,
  loadGruppenMaps,
  resolveOne,
  PORTAL_ORDER_RESOLVE_SELECT,
} from "@werk/shared/opri";

export { decodeFormat, applyOptionAttrs } from "@werk/shared/opri";

type Options = { ref?: string; all?: boolean; dryRun?: boolean };

export async function resolveOpri(opts: Options = {}) {
  const { ref, all, dryRun = false } = opts;
  const [refData, maps] = await Promise.all([
    loadResolveRefData(supabase),
    loadGruppenMaps(supabase),
  ]);

  let q = supabase.from("portal_order").select(PORTAL_ORDER_RESOLVE_SELECT);
  if (ref) q = q.eq("external_reference", ref);
  else if (!all) q = q.order("received_at", { ascending: false }).limit(20);
  const { data: orders, error } = await q;
  if (error) throw new Error(error.message);

  const results = [];
  for (const o of orders ?? []) {
    const r = resolveOne(refData, {
      id: o.id as string,
      external_reference: (o.external_reference as string | null) ?? null,
      description: (o.description as string | null) ?? null,
      quantity: (o.quantity as number | null) ?? null,
      pdf_meta: (o as { pdf_meta?: { ausrichtung?: string } | null }).pdf_meta ?? null,
      items: (o.items ?? []) as { sku: string | null; description: string | null }[],
      ...maps,
    });
    results.push(r);
    if (!dryRun) {
      await supabase
        .from("portal_order")
        .update({ resolve_result: r, resolved_at: new Date().toISOString() })
        .eq("id", o.id);
    }
  }

  const geloest = results.filter((r) => r.stammartikel_id).length;
  return {
    dryRun,
    aufträge: results.length,
    mit_stammartikel: geloest,
    ohne_zuordnung: results.length - geloest,
    ungelöste_skus: [...new Set(results.flatMap((r) => r.ungeloest))].slice(0, 40),
    beispiel: results[0] ?? null,
  };
}
