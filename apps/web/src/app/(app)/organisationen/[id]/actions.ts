"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Rechnungs-E-Mail der Organisation pflegen (Empfänger für den Rechnungsversand aus werk). */
export async function setInvoiceEmailAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("invoice_email") ?? "").trim();
  if (!id) return;
  if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return;
  const supabase = await createClient();
  await supabase.from("organization").update({ invoice_email: raw || null }).eq("id", id);
  revalidatePath(`/organisationen/${id}`);
}
