"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uebergebeBatchAnFlux } from "@/lib/druck/flux";

export type State = { ok?: boolean; error?: string; note?: string };

const JOB_STATUS: Record<string, string> = {
  gedruckt: "gedruckt",
  cellophaniert: "cellophaniert",
  abgeschlossen: "fertig",
};

/** Batch-Status setzen (bereit / gedruckt / cellophaniert / abgeschlossen / offen). */
export async function setBatchStatusAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !status) return { error: "id/status fehlt" };
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "gedruckt") patch.gedruckt_at = new Date().toISOString();
  if (status === "cellophaniert") patch.cello_erledigt_at = new Date().toISOString();

  const { error } = await supabase.from("batch").update(patch).eq("id", id);
  if (error) return { error: error.message };

  if (JOB_STATUS[status]) {
    await supabase
      .from("job")
      .update({ status: JOB_STATUS[status] })
      .eq("batch_id", id)
      .neq("status", "storniert");
  }
  revalidatePath("/druck");
  return { ok: true, note: `Status: ${status}` };
}

/** Alle offenen Druckjobs des Batches an flux übergeben (createOrder). */
export async function batchAnFluxAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  try {
    const r = await uebergebeBatchAnFlux(supabase, id);

    await supabase
      .from("batch")
      .update({
        status: "an_flux",
        an_flux_at: new Date().toISOString(),
        flux_payload: r.payload as never,
        flux_response: (r.response ?? null) as never,
        flux_order_id: r.orderId ?? null,
      })
      .eq("id", id);

    const { data: jobs } = await supabase
      .from("job")
      .select("id")
      .eq("batch_id", id)
      .in("status", ["in_batch", "offen"]);
    const ids = (jobs ?? []).map((j) => j.id as string);
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from("job")
        .update({
          status: "an_flux",
          flux_order_id: r.orderId ?? null,
          flux_order_item_id: r.itemIds?.[i] ?? null,
        })
        .eq("id", ids[i]);
    }

    revalidatePath("/druck");
    if (r.error) return { error: `${r.error} — Antwort gespeichert` };
    return {
      ok: true,
      note: r.dryRun
        ? "Dry-Run: Payload gespeichert (FLUX_API_BASE/KEY nicht gesetzt)"
        : `an flux übergeben — orderId ${r.orderId ?? "?"}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
