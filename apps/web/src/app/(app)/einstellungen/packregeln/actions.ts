"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const intOrNull = (v: FormDataEntryValue | null): number | null => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Math.round(Number(t.replace(",", ".")));
  return Number.isFinite(n) ? n : null;
};

export async function savePackregel(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const stueck_bis = intOrNull(fd.get("stueck_bis"));
  if (stueck_bis == null || stueck_bis <= 0) return { error: "Stück bis muss > 0 sein." };
  const stueck_von = intOrNull(fd.get("stueck_von")) ?? 0;
  if (stueck_von > stueck_bis) return { error: "Stück von größer als Stück bis." };
  const payload = {
    produkt_tag: String(fd.get("produkt_tag") ?? "").trim() || null,
    stueck_von,
    stueck_bis,
    packmittel_id: (fd.get("packmittel_id") as string) || null,
    spedition_erlaubt: fd.get("spedition_erlaubt") != null,
    prio: intOrNull(fd.get("prio")) ?? 100,
    is_active: fd.get("is_active") != null,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("packregel").update(payload).eq("id", id)
    : await supabase.from("packregel").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/packregeln");
  return { ok: true };
}

export async function deletePackregel(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("packregel").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/packregeln");
  return { ok: true };
}
