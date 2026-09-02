"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export async function saveRate(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const carrier_id = String(fd.get("carrier_id") ?? "");
  if (!carrier_id) return { error: "carrier_id fehlt" };

  const kg_von = num(fd.get("kg_von")) ?? 0;
  const kg_bis = num(fd.get("kg_bis"));
  const preis = num(fd.get("preis"));
  if (kg_bis == null || kg_bis <= 0) return { error: "kg bis muss > 0 sein" };
  if (preis == null || preis < 0) return { error: "Preis fehlt" };
  if (kg_von < 0 || kg_von >= kg_bis) return { error: "kg von muss < kg bis sein" };

  const zoneRaw = String(fd.get("zone") ?? "").trim();
  const zone = zoneRaw === "" ? null : Number(zoneRaw);
  if (zone != null && !Number.isInteger(zone)) return { error: "Zone muss ganzzahlig sein" };

  const produktRaw = String(fd.get("produkt") ?? "").trim();
  const gilt_ab = String(fd.get("gilt_ab") ?? "").trim() || null;
  const gilt_bis = String(fd.get("gilt_bis") ?? "").trim() || null;

  const payload = {
    carrier_id,
    produkt: produktRaw || null,
    zone,
    kg_von,
    kg_bis,
    preis,
    gilt_ab,
    gilt_bis,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("carrier_rate").update(payload).eq("id", id)
    : await supabase.from("carrier_rate").insert(payload);
  if (error) return { error: error.message };

  revalidatePath("/einstellungen/frachtpreise");
  return { ok: true };
}

export async function deleteRate(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("carrier_rate").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/frachtpreise");
  return { ok: true };
}
