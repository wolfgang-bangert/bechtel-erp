"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StempelState = { ok?: string; error?: string };

const TEXT: Record<string, string> = {
  kommen: "Eingestempelt",
  weiter: "Pause beendet",
  pause: "Pause gestartet",
  gehen: "Ausgestempelt – schönen Feierabend",
};

/** Kommen / Pause / Weiter / Gehen für die eigene Person (RPC stempeln, Uhrzeit setzt der Server). */
export async function stempelnAction(_prev: StempelState, fd: FormData): Promise<StempelState> {
  const aktion = String(fd.get("aktion") ?? "");
  if (!TEXT[aktion]) return { error: "Unbekannte Aktion." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stempeln", { p_aktion: aktion });
  if (error) return { error: error.message };
  revalidatePath("/zeiterfassung");
  return { ok: TEXT[aktion] };
}
