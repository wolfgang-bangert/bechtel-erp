"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolvePortalOrder } from "@/lib/opri/resolve";

export type State = { ok?: boolean; error?: string; note?: string };

export async function resolveOrderAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  try {
    const result = await resolvePortalOrder(supabase, id);
    const { error } = await supabase
      .from("portal_order")
      .update({ resolve_result: result, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/druckauftraege/${id}`);
    const n = result.materialliste.length;
    return {
      ok: true,
      note: result.stammartikel_id
        ? `aufgelöst — ${n} Materialzeile(n), ${result.ungeloest.length} SKU offen`
        : "kein Stammartikel erkannt",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
