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

export async function speichereBezug(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const materialId = String(fd.get("material_id") ?? "");
  const bezeichnung = String(fd.get("bezeichnung") ?? "").trim();
  if (!materialId) return { error: "material_id fehlt." };
  if (!bezeichnung) return { error: "Bezeichnung ist Pflicht." };

  const payload = {
    material_id: materialId,
    lieferant_org_id: String(fd.get("lieferant_org_id") ?? "").trim() || null,
    bezeichnung,
    rohbogen_id: String(fd.get("rohbogen_id") ?? "").trim() || null,
    druckbogen_id: String(fd.get("druckbogen_id") ?? "").trim() || null,
    lagerort: String(fd.get("lagerort") ?? "").trim() || null,
    einheit: String(fd.get("einheit") ?? "").trim() || "Bogen",
    bestand: numOrNull(fd.get("bestand")) ?? 0,
    mindestbestand: numOrNull(fd.get("mindestbestand")),
    einkaufspreis: numOrNull(fd.get("einkaufspreis")),
    quelle_bezug_id: String(fd.get("quelle_bezug_id") ?? "").trim() || null,
    nutzen: numOrNull(fd.get("nutzen")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("material_bezug").update(payload).eq("id", id)
    : await supabase.from("material_bezug").insert(payload);
  if (error) return { error: error.message };
  revalidatePath(`/einstellungen/materialkatalog/${materialId}`);
  return { ok: true };
}

export async function loescheBezug(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = fd.get("id") as string;
  const materialId = String(fd.get("material_id") ?? "");
  if (!id) return { error: "id fehlt." };
  const supabase = await createClient();
  const { error } = await supabase.from("material_bezug").delete().eq("id", id);
  if (error) return { error: error.message };
  if (materialId) revalidatePath(`/einstellungen/materialkatalog/${materialId}`);
  return { ok: true };
}

export async function umbuchen(_prev: RowState, fd: FormData): Promise<RowState> {
  const materialId = String(fd.get("material_id") ?? "");
  const quelleId = String(fd.get("quelle_id") ?? "");
  const zielId = String(fd.get("ziel_id") ?? "");
  const menge = numOrNull(fd.get("menge"));
  if (!quelleId || !zielId) return { error: "Quelle/Ziel fehlt." };
  if (!menge || menge <= 0) return { error: "Menge muss positiv sein." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("material_umbuchen", {
    p_quelle_id: quelleId,
    p_ziel_id: zielId,
    p_menge: menge,
  });
  if (error) return { error: error.message };
  if (materialId) revalidatePath(`/einstellungen/materialkatalog/${materialId}`);
  return { ok: true };
}
