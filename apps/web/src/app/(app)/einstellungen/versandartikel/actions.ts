"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const num = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export async function saveArtikel(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const bezeichnung = String(fd.get("bezeichnung") ?? "").trim();
  if (!bezeichnung) return { error: "Bezeichnung ist Pflicht." };
  const payload = {
    bezeichnung,
    einheit: String(fd.get("einheit") ?? "Stk").trim() || "Stk",
    gewicht_kg: num(fd.get("gewicht_kg")),
    ean: String(fd.get("ean") ?? "").trim() || null,
    is_active: fd.get("is_active") != null,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("versand_artikel").update(payload).eq("id", id)
    : await supabase.from("versand_artikel").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/versandartikel");
  return { ok: true };
}

export async function deleteArtikel(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("versand_artikel").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/versandartikel");
  return { ok: true };
}
