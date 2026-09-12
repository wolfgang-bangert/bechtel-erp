/**
 * Manuelle Anstöße aus der Web-App (z. B. "Banken aktualisieren"-Button auf
 * /bank) verarbeiten. Die Web-App kann fints:pull nicht selbst ausführen
 * (Python-venv nur im sync-Container) - sie legt stattdessen eine Zeile in
 * sync_request an, dieser Schritt läuft per Cron alle paar Minuten und holt
 * offene Anfragen ab.
 */
import { supabase } from "./supabase";
import { fintsPull } from "./fints";

type SyncRequest = {
  id: string;
  job: string;
  params: Record<string, unknown>;
};

export async function processSyncRequests() {
  const { data, error } = await supabase
    .from("sync_request")
    .select("id, job, params")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(5);
  if (error) throw new Error(error.message);
  const requests = (data ?? []) as SyncRequest[];
  if (!requests.length) return { verarbeitet: 0 };

  let ok = 0;
  for (const req of requests) {
    await supabase
      .from("sync_request")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", req.id);
    try {
      let result: unknown;
      switch (req.job) {
        case "fints:pull":
          result = await fintsPull(req.params as { kuerzel?: string; days?: number });
          break;
        default:
          throw new Error(`unbekannter job: ${req.job}`);
      }
      await supabase
        .from("sync_request")
        .update({ status: "done", result: result as never, finished_at: new Date().toISOString() })
        .eq("id", req.id);
      ok++;
      console.log(`  ${req.job} (${req.id}): erledigt`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase
        .from("sync_request")
        .update({ status: "error", error: message, finished_at: new Date().toISOString() })
        .eq("id", req.id);
      console.log(`  ${req.job} (${req.id}): Fehler - ${message}`);
    }
  }
  return { verarbeitet: requests.length, ok };
}
