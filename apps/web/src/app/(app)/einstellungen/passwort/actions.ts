"use server";

import { createClient } from "@/lib/supabase/server";

export type PasswortState = { ok?: boolean; error?: string };

export async function setzePasswort(
  _prev: PasswortState,
  formData: FormData,
): Promise<PasswortState> {
  const passwort = String(formData.get("passwort") ?? "");
  const passwort2 = String(formData.get("passwort2") ?? "");

  if (passwort.length < 8) return { error: "Mindestens 8 Zeichen." };
  if (passwort !== passwort2) return { error: "Die beiden Passwörter stimmen nicht überein." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: passwort });
  if (error) return { error: error.message };

  return { ok: true };
}
