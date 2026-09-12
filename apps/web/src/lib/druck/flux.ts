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

/** Prefix bereinigen: nur Leerzeichen raus (Unterstrich wie im n8n-Payload lassen). */
const fluxClean = (s: string) => (s || "").replace(/\s+/g, "");

type JobDatei = { storage_key: string; filename: string | null };

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
  dateien: JobDatei[] | null;
  order: { external_reference: string | null } | null;
};

/** Alle Dateien eines Jobs als flux-pageSources (mehrere möglich: Auto-
 *  Zuordnung + manuelle Uploads/Ersatz). Fallback auf pdf_storage_key für
 *  Jobs ohne job_datei-Zeilen (sollte nach der Migration nicht vorkommen). */
async function pageSourcesFuer(
  j: Pick<Job, "dateien" | "pdf_storage_key">,
  fallbackName: string,
): Promise<{ url: string; originalFileName: string }[]> {
  const dateien = j.dateien?.length ? j.dateien : j.pdf_storage_key ? [{ storage_key: j.pdf_storage_key, filename: null }] : [];
  const quellen = await Promise.all(
    dateien.map(async (d, i) => ({
      url: await signedGetUrl(d.storage_key, 3600),
      originalFileName: d.filename || (i === 0 ? `${fallbackName}.pdf` : `${fallbackName}_${i + 1}.pdf`),
    })),
  );
  return quellen.filter((q): q is { url: string; originalFileName: string } => !!q.url);
}

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
      "id, bauteil, papier, auflage, zuschuss, flux_product, flux_services, flux_signature, flux_printer, pdf_storage_key, " +
        "dateien:job_datei(storage_key, filename), order:portal_order_id(external_reference)",
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
      const pageSources = await pageSourcesFuer(j, `${ref}_${j.bauteil}`);
      return {
        note: j.bauteil,
        title: `${ref} · ${j.bauteil}`,
        product: j.flux_product ?? "",
        type: "print",
        copies: (Number(j.auflage) || 0) + (Number(j.zuschuss) || 0),
        services: j.flux_services ?? {},
        ...(j.flux_signature ? { signature: j.flux_signature } : {}),
        ...(j.flux_printer ? { printerName: j.flux_printer } : {}),
        pageSources,
      };
    }),
  );

  const payload = {
    ...base,
    prefix: fluxClean(String(base.prefix ?? "opri") + batch.nummer),
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
    .select("id, external_reference, ship_to, deliver_date, resolve_result")
    .eq("id", portalOrderId)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  if (!order) throw new Error("Auftrag nicht gefunden");
  const ref = (order.external_reference as string) ?? "";
  const ship = (order.ship_to as Record<string, string | null> | null) ?? {};

  // Titel-Kürzel der Produktgruppe (z.B. "WK") für den flux-Titel
  const gruppeKuerzel = (order.resolve_result as { gruppe?: string } | null)?.gruppe ?? null;
  let titelKuerzel: string | null = null;
  if (gruppeKuerzel) {
    const { data: g } = await sb
      .from("opri_produkt_gruppe")
      .select("titel_kuerzel")
      .eq("kuerzel", gruppeKuerzel)
      .maybeSingle();
    titelKuerzel = (g?.titel_kuerzel as string | null) ?? null;
  }
  const titelTeile = (bauteil: string) => [ref, titelKuerzel, bauteil].filter(Boolean).join(" · ");

  const { data: jobsRaw, error: jErr } = await sb
    .from("job")
    .select(
      "id, bauteil, papier, auflage, zuschuss, flux_product, flux_services, flux_signature, flux_paper_type, flux_printer, pdf_storage_key, " +
        "dateien:job_datei(storage_key, filename)",
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
      const pageSources = await pageSourcesFuer(j, `${ref}_${j.bauteil}`);
      const services: Record<string, unknown> = { ...(j.flux_services ?? {}) };
      if (j.flux_paper_type) services["Papiersorte"] = j.flux_paper_type;
      return {
        note: j.bauteil,
        title: titelTeile(j.bauteil),
        product: j.flux_product ?? "",
        type: "print",
        copies: (Number(j.auflage) || 0) + (Number(j.zuschuss) || 0),
        services,
        signature: j.flux_signature ?? "",
        printerName: j.flux_printer ?? "",
        pageSources,
      };
    }),
  );

  const baseDelivery = (base.deliveryAddress as Record<string, unknown>) ?? {};
  const deliveryAddress = {
    ...baseDelivery,
    name: ship.name || ship.company || "",
    organisation: ship.company || "",
    street: [ship.street, ship.addition1, ship.addition2].filter(Boolean).join(", "),
    postalCode: ship.zip || "",
    city: ship.city || "",
    state: ship.country || "",
    tel1: ship.phone || "",
    email: ship.email || null,
    project: `Auftrag ${ref}`,
  };

  // deliveryDate = Liefertermin auf Mitternacht-Z (wie n8n), sonst leer
  const deliveryDate = order.deliver_date
    ? new Date(order.deliver_date as string).toISOString().slice(0, 10) + "T00:00:00.000Z"
    : "";
  const baseSubmitter = (base.submitterAddress as Record<string, unknown>) ?? {};
  // flux (Update) begrenzt prefix hart auf 5 Zeichen, keine Sonderzeichen →
  // die letzten 5 Ziffern der Auftragsnummer. Volle Nummer in projectNumber /
  // orderNote / title.
  const prefix = (ref.replace(/\D/g, "").slice(-5) || fluxClean(String(base.prefix ?? "opri"))).slice(0, 5);
  const payload = {
    ...base,
    prefix,
    orderNote: `${(base.orderNote as string) ?? ""} · Auftrag ${ref}`.trim(),
    submitterAddress: {
      ...baseSubmitter,
      project: `Onlineprinters ${ref}`,
      projectNumber: ref,
    },
    deliveryDate,
    orderDate: "",
    deliveryAddress,
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
  const r = (response ?? {}) as {
    orderId?: string;
    orderItemIds?: string[];
    isSubmissionValid?: boolean;
    message?: string;
    details?: string[];
  };
  if (r.isSubmissionValid === false || !r.orderId) {
    const msg = [r.message, ...(r.details ?? [])].filter(Boolean).join(" — ");
    return { dryRun: false, payload, response, error: msg || "flux hat keine orderId geliefert" };
  }

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
