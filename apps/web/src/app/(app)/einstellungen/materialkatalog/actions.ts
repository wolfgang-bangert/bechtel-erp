"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string };

export async function setFluxPaperType(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("flux_paper_type") ?? "").trim();
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("material")
    .update({ flux_paper_type: raw === "" ? null : raw })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/materialkatalog");
  return { ok: true };
}
