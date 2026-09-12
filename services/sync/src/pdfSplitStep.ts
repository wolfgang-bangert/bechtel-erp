/**
 * Umschlag/Inhalt aus einer gemeinsamen 2-seitigen Druckdaten-PDF trennen
 * (aktuell: PBS "4-farbig" - Kunde liefert beides in einer Datei). Läuft in
 * portal:pull (nach opri:resolve, vor jobs:sync) und als Befehl `pdf:split`.
 * Idempotent: überspringt Aufträge, die schon passend getrennt sind; trennt
 * neu, wenn `pdf_seiten_tausch` sich seit der letzten Trennung geändert hat.
 */
import { supabase } from "./supabase";
import { getObjectBytes, putObject } from "./storage";
import { splitUmschlagInhalt, brauchtUmschlagInhaltTrennung } from "@werk/shared/druck/pdfSplit";

type Zeile = { rolle: string | null; bedruckt: boolean | null; einheit: string };

export async function splitPdfMissing(opts: { limit?: number; force?: boolean } = {}) {
  const { limit, force = false } = opts;

  const { data: raw } = await supabase
    .from("portal_order")
    .select(
      "id, external_reference, resolve_result, pdf_seiten_tausch, " +
        "files:portal_order_file(id, typ, storage_key, filename, is_zip)",
    );
  const orders = (raw ?? []) as unknown as {
    id: string;
    external_reference: string;
    resolve_result: { materialliste?: Zeile[] } | null;
    pdf_seiten_tausch: boolean;
    files: { id: string; typ: string; storage_key: string | null; filename: string | null; is_zip: boolean }[];
  }[];

  const kandidaten = (orders ?? []).filter((o) => {
    const rr = o.resolve_result as { materialliste?: Zeile[] } | null;
    if (!brauchtUmschlagInhaltTrennung(rr?.materialliste ?? [])) return false;
    const files = o.files as { typ: string; filename: string | null; storage_key: string | null }[];
    const hatQuelle = files.some((f) => f.typ === "printData" && f.storage_key);
    if (!hatQuelle) return false;
    if (force) return true;
    const schonGetrennt =
      files.some((f) => f.typ === "printDataPart" && f.filename === "Umschlag.pdf") &&
      files.some((f) => f.typ === "printDataPart" && f.filename === "Inhalt.pdf");
    return !schonGetrennt;
  });
  const liste = limit && limit > 0 ? kandidaten.slice(0, limit) : kandidaten;

  let ok = 0;
  const fehler: string[] = [];

  for (const o of liste) {
    const files = o.files as { id: string; typ: string; filename: string | null; storage_key: string | null }[];
    const quelle = files.find((f) => f.typ === "printData" && f.storage_key)!;
    try {
      const bytes = await getObjectBytes(quelle.storage_key as string);
      const { umschlag, inhalt } = await splitUmschlagInhalt(bytes, !!o.pdf_seiten_tausch);
      const ref = o.external_reference;
      const s3prefix = (quelle.storage_key as string).replace(/\/[^/]+$/, "");

      for (const [filename, data] of [
        ["Umschlag.pdf", umschlag],
        ["Inhalt.pdf", inhalt],
      ] as const) {
        const key = `${s3prefix}/printDataPart-${filename}`;
        await putObject(key, Buffer.from(data), "application/pdf");
        const bestehend = files.find((f) => f.typ === "printDataPart" && f.filename === filename);
        if (bestehend) {
          await supabase
            .from("portal_order_file")
            .update({ storage_key: key, bytes: data.byteLength, fetched_at: new Date().toISOString() })
            .eq("id", bestehend.id);
        } else {
          await supabase.from("portal_order_file").insert({
            portal_order_id: o.id,
            typ: "printDataPart",
            storage_key: key,
            filename,
            bytes: data.byteLength,
            fetched_at: new Date().toISOString(),
          });
        }
      }
      ok++;
      console.log(`  ${ref}: Umschlag/Inhalt getrennt${o.pdf_seiten_tausch ? " (getauscht)" : ""}`);
    } catch (e) {
      fehler.push(`${o.external_reference}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { kandidaten: liste.length, getrennt: ok, fehler: fehler.slice(0, 20) };
}
