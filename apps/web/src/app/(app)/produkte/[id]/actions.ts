"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const orNull = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s || null;
};

export async function saveProduktteil(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  const produktId = fd.get("produkt_id") as string;
  if (!id) return { error: "id fehlt" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("produktteil")
    .update({
      titel: orNull(fd.get("titel")),
      material_id: orNull(fd.get("material_id")),
      farbigkeit: orNull(fd.get("farbigkeit")),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/produkte/${produktId}`);
  return { ok: true };
}

export async function saveKapitel(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  const produktId = fd.get("produkt_id") as string;
  const name = String(fd.get("name") ?? "").trim();
  if (!id) return { error: "id fehlt" };
  if (!name) return { error: "Kapitelname ist Pflicht." };

  const supabase = await createClient();
  const { error } = await supabase.from("produkt_kapitel").update({ name }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/produkte/${produktId}`);
  return { ok: true };
}
