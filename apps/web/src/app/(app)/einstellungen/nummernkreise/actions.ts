"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

export async function saveNumberSequence(
  _prev: RowState,
  formData: FormData,
): Promise<RowState> {
  const key = String(formData.get("key") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim();
  const suffix = String(formData.get("suffix") ?? "").trim();
  const period = String(formData.get("period") ?? "year");
  let padding = parseInt(String(formData.get("padding") ?? "5"), 10);

  if (!key) return { error: "Kein Schlüssel." };
  if (!["none", "year"].includes(period)) return { error: "Ungültiger Reset-Modus." };
  if (!Number.isFinite(padding)) padding = 5;
  padding = Math.min(10, Math.max(1, padding));

  const payload: Record<string, unknown> = { prefix, suffix, period, padding };
  if (period === "none") payload.period_value = "";

  const supabase = await createClient();
  const { error } = await supabase
    .from("number_sequence")
    .update(payload)
    .eq("key", key);

  if (error) return { error: error.message };

  revalidatePath("/einstellungen/nummernkreise");
  return { ok: true };
}
