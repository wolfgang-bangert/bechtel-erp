"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Markiert eine In-App-Benachrichtigung als gelesen (Glocke im Layout). */
export async function markNotificationRead(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/", "layout");
}
