"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModuleLevels } from "@/lib/auth";

export type State = { error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verschmilzt alle gewählten Organisationen in die führende (merge_organization je Verlierer,
 * jede in einer eigenen Transaktion). Nur mit Recht "Vertrieb bearbeiten" (oder Admin).
 */
export async function verschmelzenAction(_prev: State, fd: FormData): Promise<State> {
  const survivor = String(fd.get("survivor") ?? "");
  const alle = fd.getAll("ids").map(String).filter((x) => UUID.test(x));
  const loser = [...new Set(alle)].filter((x) => x !== survivor);
  if (!UUID.test(survivor) || !alle.includes(survivor)) return { error: "Bitte die führende Organisation wählen." };
  if (!loser.length) return { error: "Mindestens zwei Organisationen nötig." };

  const levels = await getModuleLevels();
  if (!levels.admin && levels.vertrieb !== "edit") return { error: "Verschmelzen braucht das Recht „Vertrieb bearbeiten“." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // merge_organization ist nur für service_role freigegeben (security definer, löscht Datensätze)
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: (e as Error).message };
  }
  let anzahl = 0;
  for (const id of loser) {
    const { error } = await admin.rpc("merge_organization", { p_survivor: survivor, p_loser: id, p_merged_by: user.id });
    if (error) {
      revalidatePath("/organisationen");
      return { error: `Fehler nach ${anzahl} von ${loser.length}: ${error.message}` };
    }
    anzahl++;
  }
  revalidatePath("/organisationen");
  // Weiter zur führenden; dort werden die Verschmolzenen aus dem Warenkorb genommen
  redirect(`/organisationen/${survivor}?verschmolzen=${[survivor, ...loser].join(",")}`);
}
