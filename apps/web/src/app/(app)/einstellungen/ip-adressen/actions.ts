"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const orNull = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s || null;
};

export async function saveIpAdresse(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const ip_adresse = String(fd.get("ip_adresse") ?? "").trim();
  if (!ip_adresse) return { error: "IP-Adresse ist Pflicht." };

  const payload = {
    ip_adresse,
    geraet: orNull(fd.get("geraet")),
    hostname: orNull(fd.get("hostname")),
    mac_adresse: orNull(fd.get("mac_adresse")),
    hersteller: orNull(fd.get("hersteller")),
    maschine_id: orNull(fd.get("maschine_id")),
    notiz: orNull(fd.get("notiz")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("ip_adresse").update(payload).eq("id", id)
    : await supabase.from("ip_adresse").insert(payload);

  if (error) {
    if (error.code === "23505") return { error: `IP-Adresse ${ip_adresse} existiert bereits.` };
    return { error: error.message };
  }

  revalidatePath("/einstellungen/ip-adressen");
  return { ok: true };
}

export async function deleteIpAdresse(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("ip_adresse").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/ip-adressen");
  return { ok: true };
}
