"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteObject } from "@/lib/storage";

/** Dokument aus der Ablage löschen (Zeile + PDF im Speicher). */
export async function dokumentLoeschen(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("dokument").delete().eq("id", id).select("storage_key").maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.storage_key) {
    try {
      await deleteObject(data.storage_key);
    } catch {
      // Datei bleibt verwaist im Speicher - die Zeile ist trotzdem weg
    }
  }
  revalidatePath("/dokumente");
}
