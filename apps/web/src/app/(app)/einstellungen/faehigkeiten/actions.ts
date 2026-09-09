"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const TAETIGKEIT = ["alle", "druck", "cello", "binden", "konfektion", "sonstige"];
const ART = ["liste", "max", "min", "flag", "text"];

export async function saveFaehigkeit(_prev: RowState, fd: FormData): Promise<RowState> {
  const original = String(fd.get("original_key") ?? "").trim();
  const key = String(fd.get("key") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const label = String(fd.get("label") ?? "").trim();
  const taetigkeit = String(fd.get("taetigkeit") ?? "alle").trim();
  const art = String(fd.get("art") ?? "").trim();
  const einheit = String(fd.get("einheit") ?? "").trim() || null;
  const optionen = String(fd.get("optionen") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sortRaw = String(fd.get("sortierung") ?? "").trim();
  const sortierung = sortRaw ? Number(sortRaw) : 100;

  if (!key) return { error: "Schlüssel ist Pflicht." };
  if (!label) return { error: "Bezeichnung ist Pflicht." };
  if (!TAETIGKEIT.includes(taetigkeit)) return { error: "Tätigkeit ungültig." };
  if (!ART.includes(art)) return { error: "Art ungültig." };

  const supabase = await createClient();
  const payload = { key, label, taetigkeit, art, einheit, optionen, sortierung };

  const { error } = original
    ? await supabase.from("faehigkeit").update(payload).eq("key", original)
    : await supabase.from("faehigkeit").insert(payload);

  if (error) {
    if (error.code === "23505") return { error: `Schlüssel „${key}" existiert bereits.` };
    return { error: error.message };
  }
  revalidatePath("/einstellungen/faehigkeiten");
  revalidatePath("/einstellungen/maschinen");
  return { ok: true };
}

export async function deleteFaehigkeit(_prev: RowState, fd: FormData): Promise<RowState> {
  const key = String(fd.get("key") ?? "").trim();
  if (!key) return { error: "kein Schlüssel" };
  const supabase = await createClient();
  const { error } = await supabase.from("faehigkeit").delete().eq("key", key);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/faehigkeiten");
  revalidatePath("/einstellungen/maschinen");
  return { ok: true };
}
