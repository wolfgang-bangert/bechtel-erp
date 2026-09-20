"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const orNull = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s || null;
};

export async function saveFluxWebhookEvent(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  if (!id) return { error: "id fehlt" };

  const payload = {
    aktiv_in_flux: fd.get("aktiv_in_flux") != null,
    notiz: orNull(fd.get("notiz")),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("flux_webhook_event").update(payload).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/einstellungen/flux-webhooks");
  return { ok: true };
}
