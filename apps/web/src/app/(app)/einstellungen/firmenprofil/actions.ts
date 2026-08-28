"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveCompanyProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const value = {
    name: s(formData, "name"),
    legal_name: s(formData, "legal_name"),
    address: {
      line1: s(formData, "line1"),
      zip: s(formData, "zip"),
      city: s(formData, "city"),
      country: s(formData, "country") || "DE",
    },
    vat_id: s(formData, "vat_id"),
    tax_number: s(formData, "tax_number"),
    bank: {
      iban: s(formData, "iban"),
      bic: s(formData, "bic"),
      name: s(formData, "bank_name"),
    },
  };

  if (!value.name) return { error: "Firmenname ist Pflicht." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("setting")
    .upsert(
      { key: "company.profile", value, scope: "company" },
      { onConflict: "key" },
    );

  if (error) return { error: error.message };

  revalidatePath("/einstellungen/firmenprofil");
  revalidatePath("/einstellungen");
  return { ok: true };
}
