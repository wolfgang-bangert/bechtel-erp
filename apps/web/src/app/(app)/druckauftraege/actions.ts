"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolvePortalOrder } from "@/lib/opri/resolve";
import { erzeugeJobs } from "@/lib/druck/materialize";
import { matchOnePreis } from "@/lib/preise/match";
import { getObjectBytes, putObject } from "@/lib/storage";
import { splitUmschlagInhalt } from "@werk/shared/druck/pdfSplit";

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
      flux_printer: str(fd, "printer"),
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

/**
 * Umschlag/Inhalt-Zuordnung einer 2-seitigen Druckdaten-PDF tauschen (z. B.
 * PBS "4-farbig": meistens Seite 1 = Umschlag, Seite 2 = Inhalt - aber nicht
 * immer). Trennt sofort neu und regeneriert die Jobs, wenn die noch nicht an
 * flux übergeben sind.
 */
export async function tauschUmschlagInhaltAction(_prev: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();

  const { data: order, error: oErr } = await supabase
    .from("portal_order")
    .select(
      "id, external_reference, pdf_seiten_tausch, files:portal_order_file(id, typ, storage_key, filename)",
    )
    .eq("id", id)
    .maybeSingle();
  if (oErr) return { error: oErr.message };
  if (!order) return { error: "Auftrag nicht gefunden" };

  const files = (order.files ?? []) as { id: string; typ: string; storage_key: string | null; filename: string | null }[];
  const quelle = files.find((f) => f.typ === "printData" && f.storage_key);
  if (!quelle?.storage_key) return { error: "keine Druckdaten-PDF gefunden" };

  const neuTausch = !order.pdf_seiten_tausch;
  try {
    const bytes = await getObjectBytes(quelle.storage_key);
    const { umschlag, inhalt } = await splitUmschlagInhalt(bytes, neuTausch);
    const s3prefix = quelle.storage_key.replace(/\/[^/]+$/, "");
    const ref = order.external_reference;

    // storage_key trägt den stabilen Teil-Namen (Umschlag/Inhalt), die
    // Anzeige-Datei bekommt die Auftragsnummer, wie im Dateien-Panel gewünscht.
    const teile = [
      { teil: "Umschlag", anzeige: `${ref}_Vorderblatt.pdf`, data: umschlag },
      { teil: "Inhalt", anzeige: `${ref}_Inhalt.pdf`, data: inhalt },
    ] as const;
    for (const { teil, anzeige, data } of teile) {
      const key = `${s3prefix}/printDataPart-${teil}.pdf`;
      await putObject(key, Buffer.from(data), "application/pdf");
      const bestehend = files.find((f) => f.typ === "printDataPart" && f.storage_key === key);
      if (bestehend) {
        await supabase
          .from("portal_order_file")
          .update({ filename: anzeige, bytes: data.byteLength, fetched_at: new Date().toISOString() })
          .eq("id", bestehend.id);
      } else {
        await supabase.from("portal_order_file").insert({
          portal_order_id: id,
          typ: "printDataPart",
          storage_key: key,
          filename: anzeige,
          bytes: data.byteLength,
          fetched_at: new Date().toISOString(),
        });
      }
    }

    await supabase.from("portal_order").update({ pdf_seiten_tausch: neuTausch }).eq("id", id);

    // Jobs neu erzeugen, solange noch nichts an flux raus ist - sonst nicht anfassen.
    const { data: jobs } = await supabase.from("job").select("status").eq("portal_order_id", id);
    const status = (jobs ?? []).map((j) => j.status as string);
    const sicher = !status.length || status.every((s) => s === "offen" || s === "in_batch");
    let hinweis = "";
    if (sicher) {
      await erzeugeJobs(supabase, id);
      hinweis = " · Jobs neu erzeugt";
    } else {
      hinweis = " · Jobs sind schon weiter (an flux o.ä.) - bitte manuell prüfen";
    }

    revalidatePath(`/druckauftraege/${id}`);
    revalidatePath("/druck");
    return { ok: true, note: `Seite 1/2 ${neuTausch ? "getauscht" : "zurückgesetzt"}${hinweis}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
