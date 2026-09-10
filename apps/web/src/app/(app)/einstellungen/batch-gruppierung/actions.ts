"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erzeugeJobs } from "@/lib/druck/materialize";

export type State = { ok?: boolean; error?: string; note?: string };

const TYPEN = ["druck", "cello", "binden", "konfektion"];

export async function saveBatchGruppierung(_p: State, fd: FormData): Promise<State> {
  const cfg: Record<string, string[]> = {};
  for (const typ of TYPEN) cfg[typ] = fd.getAll(typ).map(String).filter(Boolean);
  const supabase = await createClient();
  const { error } = await supabase
    .from("setting")
    .update({ value: cfg })
    .eq("key", "batch_gruppierung");
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/batch-gruppierung");
  revalidatePath("/druck");
  return { ok: true, note: "gespeichert – gilt für neu erzeugte Jobs" };
}

/** Offene (noch nicht an flux übergebene) Aufträge neu bejobt → neue Batch-Schlüssel. */
export async function rebatchOffene(_p: State): Promise<State> {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("job")
    .select("portal_order_id, order:portal_order_id(portal_state)")
    .in("status", ["offen", "in_batch"]);
  const ids = Array.from(
    new Set(
      (jobs ?? [])
        .filter(
          (j) =>
            j.portal_order_id &&
            (j.order as { portal_state?: string } | null)?.portal_state !== "FINISHED",
        )
        .map((j) => j.portal_order_id as string),
    ),
  );
  let ok = 0;
  const fehler: string[] = [];
  for (const id of ids) {
    try {
      await erzeugeJobs(supabase, id);
      ok++;
    } catch (e) {
      fehler.push(e instanceof Error ? e.message : String(e));
    }
  }
  // leer gewordene Batches schließen
  const { data: batches } = await supabase.from("batch").select("id").neq("status", "abgeschlossen");
  for (const b of batches ?? []) {
    const { count } = await supabase
      .from("job")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", b.id)
      .in("status", ["offen", "in_batch", "an_flux", "im_druck"]);
    if (!count) await supabase.from("batch").update({ status: "abgeschlossen" }).eq("id", b.id);
  }
  revalidatePath("/druck");
  revalidatePath("/einstellungen/batch-gruppierung");
  return {
    ok: true,
    note: `${ok} Aufträge neu bejobt${fehler.length ? ` · ${fehler.length} Fehler` : ""}`,
  };
}
