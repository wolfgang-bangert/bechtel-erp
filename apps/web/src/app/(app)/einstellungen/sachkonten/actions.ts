"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const KINDS = ["revenue", "expense", "asset", "liability", "other"];

export async function saveLedgerAccount(
  _prev: RowState,
  formData: FormData,
): Promise<RowState> {
  const id = (formData.get("id") as string) || null;
  const number = String(formData.get("number") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "other");
  const is_active = formData.get("is_active") != null;

  if (!number || !name) return { error: "Kontonummer und Bezeichnung sind Pflicht." };
  if (!KINDS.includes(kind)) return { error: "Ungültige Kontoart." };

  const supabase = await createClient();
  const payload = { number, name, kind, is_active };

  const { error } = id
    ? await supabase.from("ledger_account").update(payload).eq("id", id)
    : await supabase.from("ledger_account").insert(payload);

  if (error) {
    if (error.code === "23505") return { error: `Kontonummer ${number} existiert bereits.` };
    return { error: error.message };
  }

  revalidatePath("/einstellungen/sachkonten");
  return { ok: true };
}
