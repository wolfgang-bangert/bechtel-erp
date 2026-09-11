"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseFluxServices } from "@/lib/flux/parseServices";

export type RowState = { ok?: boolean; error?: string };

const s = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
};

export async function saveGruppe(_p: RowState, fd: FormData): Promise<RowState> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("opri_produkt_gruppe")
    .update({
      titel_kuerzel: s(fd.get("titel_kuerzel")),
      flux_product: s(fd.get("flux_product")),
      flux_services: parseFluxServices(fd),
      druckverfahren: s(fd.get("druckverfahren")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/opri-produkte");
  return { ok: true };
}

export async function saveStamm(_p: RowState, fd: FormData): Promise<RowState> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("opri_stammartikel")
    .update({
      flux_product: s(fd.get("flux_product")),
      flux_services: parseFluxServices(fd),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/opri-produkte");
  return { ok: true };
}
