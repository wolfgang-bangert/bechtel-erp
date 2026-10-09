"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hotfolderAbholen, hotfolderText } from "./hotfolder";
import { nextcloudKonfiguriert } from "./webdav";

export type AbholenState = { ok?: boolean; text?: string; hinweise?: string[]; error?: string };

/** Knopf "Aus Nextcloud holen": Hotfolder sofort abholen (läuft direkt im Web-Server). */
export async function nextcloudAbholen(_prev: AbholenState): Promise<AbholenState> {
  if (!nextcloudKonfiguriert()) return { error: "Nextcloud ist noch nicht eingerichtet." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  try {
    const e = await hotfolderAbholen(supabase, user?.id ?? null);
    revalidatePath("/eingangsrechnungen");
    revalidatePath("/dokumente");
    return {
      ok: e.fehler.length === 0,
      text: hotfolderText(e),
      hinweise: [
        ...e.fehler.map((f) => `Fehler: ${f}`),
        ...e.uebersprungen.map((u) => `Kein PDF, liegen gelassen: ${u}`),
      ],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
