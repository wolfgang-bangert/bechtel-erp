/**
 * Arbeitsvorgänge mit dem Auftragsstatus abgleichen:
 *   - FINISHED-Aufträge: offene Jobs auf „fertig" setzen und aus den Batches lösen
 *     (batch_id = null), leer gewordene Batches abschließen.
 *   - offene, aufgelöste Aufträge ohne offene Jobs: Jobs erzeugen (erzeugeJobs).
 *
 * Läuft am Ende von portal:pull / portal:import-xano und als Befehl `jobs:sync`.
 */
import { supabase } from "./supabase";
import { erzeugeJobs } from "./erzeugeJobs";

const TERMINAL = ["FINISHED"];
const OFFEN = ["offen", "in_batch", "an_flux", "im_druck"];

export async function jobsSync(opts: { generate?: boolean } = {}) {
  const { generate = true } = opts;

  // ---- 1) FINISHED-Aufträge: offene Jobs schließen -------------------
  const { data: finished } = await supabase
    .from("portal_order")
    .select("id")
    .in("portal_state", TERMINAL);
  const finishedIds = (finished ?? []).map((r) => r.id as string);

  let jobsGeschlossen = 0;
  const batchesBetroffen = new Set<string>();
  for (let i = 0; i < finishedIds.length; i += 100) {
    const chunk = finishedIds.slice(i, i + 100);
    const { data: jobs } = await supabase
      .from("job")
      .select("id, batch_id")
      .in("portal_order_id", chunk)
      .in("status", OFFEN);
    for (const j of jobs ?? []) {
      if (j.batch_id) batchesBetroffen.add(j.batch_id as string);
      await supabase.from("job").update({ status: "fertig", batch_id: null }).eq("id", j.id);
      jobsGeschlossen++;
    }
  }

  // ---- 2) leer gewordene Batches abschließen -----------------------
  let batchesAbgeschlossen = 0;
  for (const bId of batchesBetroffen) {
    const { count } = await supabase
      .from("job")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", bId)
      .in("status", OFFEN);
    if (!count) {
      await supabase.from("batch").update({ status: "abgeschlossen" }).eq("id", bId).neq("status", "abgeschlossen");
      batchesAbgeschlossen++;
    }
  }

  // ---- 3) Auto-Generierung ---------------------------------------
  let auftraegeMitJobs = 0;
  let jobsNeu = 0;
  const fehler: { ref: string; error: string }[] = [];
  if (generate) {
    // portal_order_ids mit bereits offenen Jobs sammeln (seitenweise)
    const mitOffenenJobs = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("job")
        .select("portal_order_id")
        .in("status", OFFEN)
        .range(from, from + 999);
      if (!data?.length) break;
      for (const r of data) if (r.portal_order_id) mitOffenenJobs.add(r.portal_order_id as string);
      if (data.length < 1000) break;
    }

    const { data: kandidaten } = await supabase
      .from("portal_order")
      .select("id, external_reference, resolve_result, portal_state");
    for (const o of kandidaten ?? []) {
      if (TERMINAL.includes(String(o.portal_state))) continue;
      const rr = o.resolve_result as { stammartikel_id?: string } | null;
      if (!rr?.stammartikel_id) continue;
      if (mitOffenenJobs.has(o.id as string)) continue;
      try {
        const r = await erzeugeJobs(o.id as string);
        auftraegeMitJobs++;
        jobsNeu += r.jobs;
      } catch (e) {
        fehler.push({
          ref: (o.external_reference as string) ?? (o.id as string),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return {
    finished_aufträge: finishedIds.length,
    jobs_geschlossen: jobsGeschlossen,
    batches_abgeschlossen: batchesAbgeschlossen,
    aufträge_neu_bejobt: auftraegeMitJobs,
    jobs_neu: jobsNeu,
    fehler: fehler.slice(0, 20),
  };
}
