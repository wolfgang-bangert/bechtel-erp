"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const numOrNull = (v: FormDataEntryValue | null): number | null => {
  const t = String(v ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export async function savePackmittel(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const bezeichnung = String(fd.get("bezeichnung") ?? "").trim();
  if (!bezeichnung) return { error: "Bezeichnung ist Pflicht." };
  const payload = {
    bezeichnung,
    kategorie: String(fd.get("kategorie") ?? "").trim() || null,
    laenge_mm: numOrNull(fd.get("laenge_mm")),
    breite_mm: numOrNull(fd.get("breite_mm")),
    hoehe_mm: numOrNull(fd.get("hoehe_mm")),
    leergewicht_kg: numOrNull(fd.get("leergewicht_kg")) ?? 0,
    max_fuellgewicht_kg: numOrNull(fd.get("max_fuellgewicht_kg")),
    material: String(fd.get("material") ?? "").trim() || null,
    is_active: fd.get("is_active") != null,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("packmittel").update(payload).eq("id", id)
    : await supabase.from("packmittel").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/packmittel");
  return { ok: true };
}

export async function deletePackmittel(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("packmittel").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/packmittel");
  return { ok: true };
}
