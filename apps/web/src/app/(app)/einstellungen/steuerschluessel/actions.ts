"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const TREATMENTS = [
  "standard_de",
  "reverse_charge_eu",
  "intra_community_supply",
  "export_third_country",
  "tax_free_other",
];
const DIRECTIONS = ["output", "input"];

export async function saveTaxCode(
  _prev: RowState,
  formData: FormData,
): Promise<RowState> {
  const id = (formData.get("id") as string) || null;
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const rateRaw = String(formData.get("rate") ?? "").replace(",", ".").trim();
  const treatment = String(formData.get("treatment") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const datev_tax_key = String(formData.get("datev_tax_key") ?? "").trim() || null;
  const is_active = formData.get("is_active") != null;

  const rate = Number(rateRaw);
  if (!code || !name) return { error: "Kürzel und Bezeichnung sind Pflicht." };
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    return { error: "Satz muss zwischen 0 und 100 liegen." };
  if (!TREATMENTS.includes(treatment)) return { error: "Ungültige Steuerbehandlung." };
  if (!DIRECTIONS.includes(direction)) return { error: "Ungültige Richtung." };

  const supabase = await createClient();
  const payload = { code, name, rate, treatment, direction, datev_tax_key, is_active };

  const { error } = id
    ? await supabase.from("tax_code").update(payload).eq("id", id)
    : await supabase.from("tax_code").insert(payload);

  if (error) {
    if (error.code === "23505") return { error: `Kürzel ${code} existiert bereits.` };
    return { error: error.message };
  }

  revalidatePath("/einstellungen/steuerschluessel");
  return { ok: true };
}
