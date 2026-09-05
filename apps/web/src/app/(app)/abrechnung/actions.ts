"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { erstelleAbrechnung, abrechnungNeuSummieren } from "@/lib/abrechnung/erstellen";

export type State = { ok?: boolean; error?: string; note?: string };

export async function erstellenAction(_p: State, fd: FormData): Promise<State> {
  const jahr = Number(fd.get("jahr"));
  const kw = Number(fd.get("kw"));
  if (!jahr || !kw) return { error: "Jahr und KW angeben" };
  const supabase = await createClient();
  try {
    const r = await erstelleAbrechnung(supabase, jahr, kw);
    revalidatePath("/abrechnung");
    redirect(`/abrechnung/${r.abrechnung_id}`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setBetragAction(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const abrechnungId = String(fd.get("abrechnung_id") ?? "");
  if (!id) return { error: "id fehlt" };
  const raw = String(fd.get("betrag_netto") ?? "").trim().replace(",", ".");
  const betrag = raw === "" ? 0 : Number(raw);
  if (!Number.isFinite(betrag)) return { error: "Betrag ungültig" };

  const supabase = await createClient();
  const { data: abr } = await supabase.from("abrechnung").select("status").eq("id", abrechnungId).maybeSingle();
  if (abr?.status === "festgeschrieben") return { error: "Abrechnung ist festgeschrieben" };

  const { error } = await supabase
    .from("abrechnung_position")
    .update({ betrag_netto: Math.round(betrag * 100) / 100, manuell: true, rekla_vermerk: String(fd.get("rekla_vermerk") ?? "").trim() || null })
    .eq("id", id);
  if (error) return { error: error.message };
  await abrechnungNeuSummieren(supabase, abrechnungId);
  revalidatePath(`/abrechnung/${abrechnungId}`);
  return { ok: true };
}

export async function positionEntfernenAction(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const abrechnungId = String(fd.get("abrechnung_id") ?? "");
  const portalOrderId = String(fd.get("portal_order_id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { data: abr } = await supabase.from("abrechnung").select("status").eq("id", abrechnungId).maybeSingle();
  if (abr?.status === "festgeschrieben") return { error: "Abrechnung ist festgeschrieben" };

  const { error } = await supabase.from("abrechnung_position").delete().eq("id", id);
  if (error) return { error: error.message };
  if (portalOrderId) await supabase.from("portal_order").update({ abrechnung_id: null }).eq("id", portalOrderId);
  await abrechnungNeuSummieren(supabase, abrechnungId);
  revalidatePath(`/abrechnung/${abrechnungId}`);
  return { ok: true };
}

export async function festschreibenAction(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("abrechnung")
    .update({ status: "festgeschrieben", festgeschrieben_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/abrechnung/${id}`);
  revalidatePath("/abrechnung");
  return { ok: true, note: "festgeschrieben" };
}
