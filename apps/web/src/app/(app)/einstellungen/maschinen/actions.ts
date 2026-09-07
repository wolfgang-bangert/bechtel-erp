"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const TYPEN = ["druck", "cello", "binden", "konfektion", "sonstige"];

export async function saveMaschine(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const name = String(fd.get("name") ?? "").trim();
  const typ = String(fd.get("typ") ?? "").trim();
  const flux_printer_name = String(fd.get("flux_printer_name") ?? "").trim() || null;
  const farbe = String(fd.get("farbe") ?? "").trim() || null;
  const kapRaw = String(fd.get("kapazitaet_bogen_h") ?? "").trim();
  const kapazitaet_bogen_h = kapRaw ? Number(kapRaw) : null;
  const sortRaw = String(fd.get("sortierung") ?? "").trim();
  const sortierung = sortRaw ? Number(sortRaw) : 100;
  const aktiv = fd.get("aktiv") != null;

  if (!name) return { error: "Name ist Pflicht." };
  if (!TYPEN.includes(typ)) return { error: "Typ ungültig." };
  if (kapazitaet_bogen_h != null && !Number.isFinite(kapazitaet_bogen_h))
    return { error: "Kapazität muss eine Zahl sein." };

  const supabase = await createClient();
  const payload = {
    name,
    typ,
    flux_printer_name,
    farbe,
    kapazitaet_bogen_h,
    sortierung,
    aktiv,
  };
  const { error } = id
    ? await supabase.from("maschine").update(payload).eq("id", id)
    : await supabase.from("maschine").insert(payload);

  if (error) {
    if (error.code === "23505") return { error: `Maschine „${name}" existiert bereits.` };
    return { error: error.message };
  }
  revalidatePath("/einstellungen/maschinen");
  revalidatePath("/druck/plan");
  return { ok: true };
}
