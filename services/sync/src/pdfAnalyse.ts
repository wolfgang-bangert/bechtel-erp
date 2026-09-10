/**
 * PDF-Ausrichtung nachtragen – nur für Aufträge, deren resolve_result keine
 * Ausrichtung hat und für die noch kein pdf_meta gespeichert ist.
 * Läuft in portal:pull (vor opri:resolve) und als Befehl `pdf:analyse`.
 */
import { supabase } from "./supabase";
import { getObjectBytes } from "./storage";
import { analysePdfMeta } from "./pdfMeta";

export async function analysePdfMissing(opts: { limit?: number; force?: boolean } = {}) {
  const { limit, force = false } = opts;

  const { data: orders } = await supabase
    .from("portal_order")
    .select(
      "id, external_reference, resolve_result, pdf_meta, files:portal_order_file(typ, storage_key, is_zip)",
    );

  const kandidaten = (orders ?? []).filter((o) => {
    const a = ((o.resolve_result as { attribute?: Record<string, unknown> } | null)?.attribute ??
      {}) as Record<string, unknown>;
    if (a.ausrichtung) return false;
    if (!force && o.pdf_meta) return false;
    const pd = (
      o.files as { typ: string; storage_key: string | null; is_zip: boolean }[] | null
    )?.find((f) => f.typ === "printData" && f.storage_key && !f.is_zip);
    return !!pd;
  });
  const liste = limit && limit > 0 ? kandidaten.slice(0, limit) : kandidaten;

  let ok = 0;
  let hoch = 0;
  let quer = 0;
  let quadrat = 0;
  const fehler: string[] = [];

  for (const o of liste) {
    const pd = (
      o.files as { typ: string; storage_key: string | null; is_zip: boolean }[]
    ).find((f) => f.typ === "printData" && f.storage_key && !f.is_zip)!;
    try {
      const buf = await getObjectBytes(pd.storage_key as string);
      const meta = analysePdfMeta(buf);
      const { error } = await supabase
        .from("portal_order")
        .update({ pdf_meta: meta as never })
        .eq("id", o.id);
      if (error) throw new Error(error.message);
      ok++;
      if (meta.ausrichtung === "Hochformat") hoch++;
      else if (meta.ausrichtung === "Querformat") quer++;
      else quadrat++;
    } catch (e) {
      fehler.push(
        `${o.external_reference}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    kandidaten: liste.length,
    analysiert: ok,
    hochformat: hoch,
    querformat: quer,
    ohne_ausrichtung: quadrat,
    fehler: fehler.slice(0, 20),
  };
}
