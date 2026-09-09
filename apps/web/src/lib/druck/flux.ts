/**
 * flux-Übergabe eines Druck-Batches: baut das createOrder-Payload aus den
 * Druckjobs + der Basiskonfig (setting 'flux_createorder_base') und schickt es
 * an flux, sofern FLUX_API_BASE / FLUX_API_KEY gesetzt sind. Sonst Dry-Run
 * (Payload wird am Batch gespeichert, damit man es prüfen kann).
 *
 * flux-API: POST {FLUX_API_BASE}/createOrder, Header `apikey`.
 * pageSources als URL (signierte S3-Links auf die werk-Druck-PDF).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedGetUrl } from "@/lib/storage";

/** flux akzeptiert als prefix nur Buchstaben/Ziffern (keine Leer-/Sonderzeichen). */
const fluxPrefix = (s: string) => (s || "").replace(/[^A-Za-z0-9]/g, "");

type Job = {
  id: string;
  bauteil: string;
  papier: string | null;
  auflage: number;
  zuschuss: number;
  flux_product: string | null;
  flux_services: Record<string, unknown> | null;
  flux_signature: string | null;
  flux_printer: string | null;
  pdf_storage_key: string | null;
  order: { external_reference: string | null } | null;
};

export type FluxHandoff = {
  dryRun: boolean;
  payload: unknown;
  response?: unknown;
  orderId?: string | null;
  itemIds?: string[];
  error?: string;
};

export async function uebergebeBatchAnFlux(
  sb: SupabaseClient,
  batchId: string,
): Promise<FluxHandoff> {
  const { data: batch, error: bErr } = await sb
    .from("batch")
    .select("id, nummer, typ, cello, papier, druckbogen")
    .eq("id", batchId)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  if (!batch) throw new Error("Batch nicht gefunden");
  if (batch.typ !== "druck") throw new Error(`Batch ${batch.nummer} ist kein Druck-Batch (${batch.typ})`);

  const { data: jobsRaw, error: jErr } = await sb
    .from("job")
    .select(
      "id, bauteil, papier, auflage, zuschuss, flux_product, flux_services, flux_signature, flux_printer, pdf_storage_key, order:portal_order_id(external_reference)",
    )
    .eq("batch_id", batchId)
    .eq("typ", "druck")
    .in("status", ["in_batch", "offen"]);
  if (jErr) throw new Error(jErr.message);
  const jobs = (jobsRaw ?? []) as unknown as Job[];
  if (!jobs.length) throw new Error("Batch hat keine offenen Druckjobs");

  const { data: cfgRow } = await sb
    .from("setting")
    .select("value")
    .eq("key", "flux_createorder_base")
    .maybeSingle();
  const base = (cfgRow?.value as Record<string, unknown>) ?? {};

  const orderItems = await Promise.all(
    jobs.map(async (j) => {
      const ref = j.order?.external_reference ?? "";
      const url = j.pdf_storage_key ? await signedGetUrl(j.pdf_storage_key, 3600) : null;
      return {
        note: j.bauteil,
        title: `${ref} · ${j.bauteil}`,
        product: j.flux_product ?? "",
        type: "print",
        copies: (Number(j.auflage) || 0) + (Number(j.zuschuss) || 0),
        services: j.flux_services ?? {},
        ...(j.flux_signature ? { signature: j.flux_signature } : {}),
        ...(j.flux_printer ? { printerName: j.flux_printer } : {}),
        pageSources: url ? [{ url, originalFileName: `${ref}_${j.bauteil}.pdf` }] : [],
      };
    }),
  );

  const payload = {
    ...base,
    prefix: fluxPrefix(batch.nummer),
    orderNote: `${(base.orderNote as string) ?? ""} · Batch ${batch.nummer}`.trim(),
    orderItems,
  };

  const apiBase = process.env.FLUX_API_BASE;
  const apiKey = process.env.FLUX_API_KEY;
  if (!apiBase || !apiKey) {
    return { dryRun: true, payload };
  }

  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/createOrder`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: apiKey },
    body: JSON.stringify(payload),
  });
  const response = await res.json().catch(() => null);
  if (!res.ok) {
    return { dryRun: false, payload, response, error: `flux ${res.status}` };
  }
  const r = (response ?? {}) as { orderId?: string; orderItemIds?: string[] };
  return {
    dryRun: false,
    payload,
    response,
    orderId: r.orderId ?? null,
    itemIds: r.orderItemIds ?? [],
  };
}

/**
 * Einen Druckauftrag direkt an flux übergeben (ohne Batch): ein orderItem je
 * Druck-Job des Auftrags, mit den am Auftrag gepflegten flux-Feldern.
 */
export async function sendeAuftragAnFlux(
  sb: SupabaseClient,
  portalOrderId: string,
): Promise<FluxHandoff> {
  const { data: order, error: oErr } = await sb
    .from("portal_order")
    .select("id, external_reference")
    .eq("id", portalOrderId)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  if (!order) throw new Error("Auftrag nicht gefunden");
  const ref = (order.external_reference as string) ?? "";

  const { data: jobsRaw, error: jErr } = await sb
    .from("job")
    .select(
      "id, bauteil, papier, auflage, zuschuss, flux_product, flux_services, flux_signature, flux_paper_type, flux_printer, pdf_storage_key",
    )
    .eq("portal_order_id", portalOrderId)
    .eq("typ", "druck")
    .neq("status", "storniert");
  if (jErr) throw new Error(jErr.message);
  const jobs = (jobsRaw ?? []) as unknown as (Job & { flux_paper_type: string | null })[];
  if (!jobs.length) throw new Error("Auftrag hat keine Druck-Jobs");

  const fehlt = jobs.filter((j) => !j.flux_product).map((j) => j.bauteil);
  if (fehlt.length) throw new Error(`flux-Produkt fehlt: ${fehlt.join(", ")}`);

  const { data: cfgRow } = await sb
    .from("setting")
    .select("value")
    .eq("key", "flux_createorder_base")
    .maybeSingle();
  const base = (cfgRow?.value as Record<string, unknown>) ?? {};

  const orderItems = await Promise.all(
    jobs.map(async (j) => {
      const url = j.pdf_storage_key ? await signedGetUrl(j.pdf_storage_key, 3600) : null;
      const services: Record<string, unknown> = { ...(j.flux_services ?? {}) };
      if (j.flux_paper_type) services["Papiersorte"] = j.flux_paper_type;
      return {
        note: j.bauteil,
        title: `${ref} · ${j.bauteil}`,
        product: j.flux_product ?? "",
        type: "print",
        copies: (Number(j.auflage) || 0) + (Number(j.zuschuss) || 0),
        services,
        ...(j.flux_signature ? { signature: j.flux_signature } : {}),
        ...(j.flux_printer ? { printerName: j.flux_printer } : {}),
        pageSources: url ? [{ url, originalFileName: `${ref}_${j.bauteil}.pdf` }] : [],
      };
    }),
  );

  const payload = {
    ...base,
    prefix: fluxPrefix(ref),
    orderNote: `${(base.orderNote as string) ?? ""} · Auftrag ${ref}`.trim(),
    orderItems,
  };

  const apiBase = process.env.FLUX_API_BASE;
  const apiKey = process.env.FLUX_API_KEY;
  if (!apiBase || !apiKey) return { dryRun: true, payload };

  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/createOrder`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: apiKey },
    body: JSON.stringify(payload),
  });
  const response = await res.json().catch(() => null);
  if (!res.ok) return { dryRun: false, payload, response, error: `flux ${res.status}` };
  const r = (response ?? {}) as { orderId?: string; orderItemIds?: string[] };

  // Ergebnis an den Jobs vermerken
  const ids = jobs.map((j) => j.id);
  for (let i = 0; i < ids.length; i++) {
    await sb
      .from("job")
      .update({
        status: "an_flux",
        flux_order_id: r.orderId ?? null,
        flux_order_item_id: r.orderItemIds?.[i] ?? null,
      })
      .eq("id", ids[i]);
  }

  return { dryRun: false, payload, response, orderId: r.orderId ?? null, itemIds: r.orderItemIds ?? [] };
}
