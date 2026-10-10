"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { akontoVerrechnen } from "@/lib/akonto";

/** Rechnungs-E-Mail der Organisation pflegen (Empfänger für den Rechnungsversand aus werk). */
export async function setInvoiceEmailAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("invoice_email") ?? "").trim();
  if (!id) return;
  if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return;
  const supabase = await createClient();
  await supabase.from("organization").update({ invoice_email: raw || null }).eq("id", id);
  revalidatePath(`/organisationen/${id}`);
}

export type AkontoState = { ok?: string; error?: string };

/** Akonto-Zahlungen dieser Organisation mit den ältesten offenen Rechnungen verrechnen. */
export async function akontoVerrechnenAction(_p: AkontoState, fd: FormData): Promise<AkontoState> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Organisation fehlt." };
  const supabase = await createClient();
  try {
    const r = await akontoVerrechnen(supabase, id);
    revalidatePath(`/organisationen/${id}`);
    revalidatePath("/bank");
    revalidatePath("/offene-posten");
    return {
      ok: `${r.verrechnet.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € auf ${r.rechnungen} Rechnung(en) verrechnet` +
        (r.rest > 0.005 ? `, ${r.rest.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € bleiben Akonto (keine offenen Rechnungen mehr)` : ""),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
