"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolvePortalOrder } from "@/lib/opri/resolve";
import { erzeugeJobs } from "@/lib/druck/materialize";
import { matchOnePreis } from "@/lib/preise/match";

export type State = { ok?: boolean; error?: string; note?: string };

const str = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};

/** Versanddatum / berechnet / Rekla am Auftrag pflegen. */
export async function savePreisFelderAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("portal_order")
    .update({
      versand_datum: str(fd, "versand_datum"),
      berechnet: fd.get("berechnet") != null,
      ist_rekla: fd.get("ist_rekla") != null,
      rekla_vermerk: str(fd, "rekla_vermerk"),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/druckauftraege/${id}`);
  return { ok: true, note: "gespeichert" };
}

/** Preis aus der gültigen Preisliste ermitteln. */
export async function preisErmittelnAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  try {
    const r = await matchOnePreis(supabase, id);
    revalidatePath(`/druckauftraege/${id}`);
    return r.ok
      ? { ok: true, note: `${r.preis_netto.toFixed(2)} € netto (${r.liste}, ${r.spalten_key})` }
      : { error: r.grund };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveOrderAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  try {
    const result = await resolvePortalOrder(supabase, id);
    const { error } = await supabase
      .from("portal_order")
      .update({ resolve_result: result, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/druckauftraege/${id}`);
    const n = result.materialliste.length;
    return {
      ok: true,
      note: result.stammartikel_id
        ? `aufgelöst — ${n} Materialzeile(n), ${result.ungeloest.length} SKU offen`
        : "kein Stammartikel erkannt",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function druckjobsAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  try {
    const r = await erzeugeJobs(supabase, id);
    revalidatePath(`/druckauftraege/${id}`);
    revalidatePath("/druck");
    const typen = Object.entries(r.nach_typ)
      .map(([t, n]) => `${n} ${t}`)
      .join(", ");
    return {
      ok: true,
      note: `${r.jobs} Job(s) [${typen}] in ${r.batches.length} Batch(es)${
        r.batches_neu ? ` · ${r.batches_neu} neu` : ""
      }${r.uebersprungen.length ? ` · übersprungen: ${r.uebersprungen.join("; ")}` : ""}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
