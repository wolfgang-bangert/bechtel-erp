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

/** flux-Felder eines Druck-Jobs pflegen (Produkt / Standbogen / Papiersorte /
 *  Beidseitig / Farbe). Beidseitig+Farbe landen in flux_services. */
export async function saveJobFluxAction(_prev: State, fd: FormData): Promise<State> {
  const orderId = String(fd.get("order_id") ?? "");
  const jobId = String(fd.get("job_id") ?? "");
  if (!jobId) return { error: "job_id fehlt" };
  const supabase = await createClient();

  const { data: cur } = await supabase
    .from("job")
    .select("flux_services")
    .eq("id", jobId)
    .maybeSingle();
  const services: Record<string, unknown> = { ...((cur?.flux_services as Record<string, unknown>) ?? {}) };
  const setSvc = (name: string, key: string) => {
    const v = str(fd, key);
    if (v) services[name] = v;
    else delete services[name];
  };
  setSvc("Beidseitig", "beidseitig");
  setSvc("Farbiger Druck", "farbe");

  const { error } = await supabase
    .from("job")
    .update({
      flux_product: str(fd, "flux_product"),
      flux_signature: str(fd, "signature"),
      flux_paper_type: str(fd, "paper_type"),
      flux_services: services,
    })
    .eq("id", jobId);
  if (error) return { error: error.message };
  if (orderId) revalidatePath(`/druckauftraege/${orderId}`);
  return { ok: true, note: "gespeichert" };
}

/** Den Auftrag direkt an flux übergeben (ein orderItem je Druck-Job). */
export async function sendeAuftragAnFluxAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  try {
    const { sendeAuftragAnFlux } = await import("@/lib/druck/flux");
    const r = await sendeAuftragAnFlux(supabase, id);
    // Payload + Antwort immer festhalten (auch bei Fehler / Dry-Run)
    await supabase
      .from("portal_order")
      .update({
        flux_payload: (r.payload ?? null) as never,
        flux_response: (r.response ?? null) as never,
        flux_order_id: r.orderId ?? null,
        flux_sent_at: new Date().toISOString(),
      })
      .eq("id", id);
    revalidatePath(`/druckauftraege/${id}`);
    revalidatePath("/druck");
    if (r.error) return { error: r.error };
    return {
      ok: true,
      note: r.dryRun
        ? "Dry-Run: FLUX_API_BASE/KEY nicht gesetzt — Payload gespeichert, nicht gesendet"
        : `an flux übergeben — orderId ${r.orderId ?? "?"}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
