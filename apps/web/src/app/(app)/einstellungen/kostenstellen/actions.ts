"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

export async function saveCostCenter(
  _prev: RowState,
  formData: FormData,
): Promise<RowState> {
  const id = (formData.get("id") as string) || null;
  const number = String(formData.get("number") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const is_active = formData.get("is_active") != null;

  if (!number || !name) return { error: "Nummer und Bezeichnung sind Pflicht." };

  const supabase = await createClient();
  const payload = { number, name, is_active };

  const { error } = id
    ? await supabase.from("cost_center").update(payload).eq("id", id)
    : await supabase.from("cost_center").insert(payload);

  if (error) {
    if (error.code === "23505") return { error: `Nummer ${number} existiert bereits.` };
    return { error: error.message };
  }

  revalidatePath("/einstellungen/kostenstellen");
  return { ok: true };
}
