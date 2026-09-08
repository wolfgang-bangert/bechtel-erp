"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { autoAssignDruckMaschinen } from "@/lib/druck/maschine";

/** Phase-Spalte → kanonischer batch.status. */
const PHASE_STATUS: Record<string, string> = {
  warteschlange: "bereit",
  laeuft: "im_druck",
  fertig: "abgeschlossen",
};
/** batch.status → job.status (nur wo eine Spiegelung sinnvoll ist). */
const JOB_STATUS: Record<string, string> = {
  bereit: "in_batch",
  im_druck: "im_druck",
  abgeschlossen: "fertig",
};

export type MoveArgs = {
  batchId: string;
  maschineId: string | null;
  phase: "" | "warteschlange" | "laeuft" | "fertig";
  orderedIds: string[];
};

/** Eine Karte im Belegungs-Board bewegen (Maschine + Phase + Reihenfolge der Ziel-Lane). */
export async function movePlanBatch(args: MoveArgs): Promise<{ ok: boolean; error?: string }> {
  const { batchId, maschineId, phase, orderedIds } = args;
  if (!batchId) return { ok: false, error: "batchId fehlt" };
  const supabase = await createClient();

  const patch: Record<string, unknown> = { maschine_id: maschineId || null };
  const status = phase ? PHASE_STATUS[phase] : null;
  if (status) {
    patch.status = status;
    if (status === "abgeschlossen") patch.gedruckt_at = new Date().toISOString();
  }

  const { error } = await supabase.from("batch").update(patch).eq("id", batchId);
  if (error) return { ok: false, error: error.message };

  if (status && JOB_STATUS[status]) {
    await supabase
      .from("job")
      .update({ status: JOB_STATUS[status] })
      .eq("batch_id", batchId)
      .neq("status", "storniert");
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from("batch").update({ plan_reihenfolge: i }).eq("id", orderedIds[i]);
  }

  revalidatePath("/druck/plan");
  revalidatePath("/druck");
  return { ok: true };
}

/** Alle offenen Druck-Batches automatisch der passenden Maschine zuordnen. */
export async function autoAssignAction(): Promise<{ ok: boolean; error?: string; note?: string }> {
  const supabase = await createClient();
  try {
    const r = await autoAssignDruckMaschinen(supabase);
    revalidatePath("/druck/plan");
    revalidatePath("/druck");
    return {
      ok: true,
      note:
        `${r.zugeordnet} zugeordnet · ${r.unverändert} unverändert` +
        (r.ohne_maschine.length ? ` · ${r.ohne_maschine.length} ohne Maschine` : ""),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Geschätzte Rüst-/Laufzeit eines Batches setzen (Minuten, für die Lane-Auslastung). */
export async function setBatchDauer(
  id: string,
  minutes: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "id fehlt" };
  if (minutes != null && (!Number.isFinite(minutes) || minutes < 0))
    return { ok: false, error: "ungültig" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("batch")
    .update({ dauer_minuten: minutes })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/druck/plan");
  return { ok: true };
}
