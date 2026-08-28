"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "E-Mail und Passwort eingeben." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("invalid login credentials"))
      return { error: "E-Mail oder Passwort falsch." };
    if (m.includes("email not confirmed"))
      return {
        error:
          "E-Mail noch nicht bestaetigt. Im Supabase-Dashboard beim Benutzer 'Confirm user' waehlen.",
      };
    return { error: `Anmeldung fehlgeschlagen: ${error.message}` };
  }

  revalidatePath("/", "layout");
  redirect("/einstellungen");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
