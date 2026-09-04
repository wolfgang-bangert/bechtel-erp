/**
 * Erzeugt aus der Auflösung eines Druckauftrags (portal_order.resolve_result)
 * die Druckjobs und ordnet sie Batches zu.
 *
 * Regel: jede Materialzeile mit Bogen/Blatt und bedruckt ≠ false wird ein
 * Druckjob – außer Graukarton/Graupappe („bis auf Graukarton alles bedrucken").
 * Batch-Schlüssel: druckverfahren | cello | papier | druckbogen.
 * Cello-Batches (matt/glanz) tragen den Extra-Schritt Cellophanieren.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolveResult } from "@/lib/opri/resolve";

type Zeile = ResolveResult["materialliste"][number];

const NICHT_BEDRUCKT = /graukarton|graupappe|graukart/i;

const norm = (v: unknown) => (v == null ? "" : String(v).trim());

function istDruckzeile(z: Zeile): boolean {
  if (z.bedruckt === false) return false;
  if (z.einheit !== "bogen" && z.einheit !== "blatt") return false;
  if (!z.material && !z.material_kurz) return false;
  if (NICHT_BEDRUCKT.test(`${z.material ?? ""} ${z.material_kurz ?? ""} ${z.rolle ?? ""}`)) return false;
  return true;
}

function batchSchluessel(p: {
  druckverfahren: string | null;
  cello: string;
  papier: string | null;
  druckbogen: string | null;
}): string {
  return [norm(p.druckverfahren), p.cello || "keine", norm(p.papier), norm(p.druckbogen)].join(" | ");
}

export type MaterializeResult = {
  jobs: number;
  batches_neu: number;
  batches: { nummer: string; schluessel: string; jobs: number }[];
  uebersprungen: string[];
};

export async function erzeugeDruckjobs(
  sb: SupabaseClient,
  portalOrderId: string,
): Promise<MaterializeResult> {
  const { data: order, error } = await sb
    .from("portal_order")
    .select("id, external_reference, quantity, resolve_result, files:portal_order_file(typ, storage_key)")
    .eq("id", portalOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) throw new Error("Auftrag nicht gefunden");

  const rr = order.resolve_result as ResolveResult | null;
  if (!rr) throw new Error("Auftrag ist noch nicht aufgelöst");

  const printKey =
    (order.files as { typ: string; storage_key: string | null }[] | null)?.find(
      (f) => f.typ === "printData" && f.storage_key,
    )?.storage_key ?? null;

  // flux_product per Cascade (Stammartikel → Gruppe), sonst flux_template –
  // Fallback nur, wenn die Materialzeile kein flux-Template aufgelöst hat.
  let fluxProductFallback: string | null = null;
  if (rr.stammartikel_id) {
    const { data: st } = await sb
      .from("opri_stammartikel")
      .select("flux_product")
      .eq("id", rr.stammartikel_id)
      .maybeSingle();
    fluxProductFallback = (st?.flux_product as string | null) ?? null;
  }
  if (!fluxProductFallback && rr.gruppe) {
    const { data: g } = await sb
      .from("opri_produkt_gruppe")
      .select("flux_product")
      .eq("kuerzel", rr.gruppe)
      .maybeSingle();
    fluxProductFallback = (g?.flux_product as string | null) ?? null;
  }
  fluxProductFallback = fluxProductFallback ?? rr.flux_template ?? null;

  const auflage = Number(order.quantity) || 0;
  const uebersprungen: string[] = [];
  const druckzeilen = (rr.materialliste ?? []).filter((z) => {
    const ok = istDruckzeile(z);
    if (!ok && (z.material || z.material_kurz)) {
      uebersprungen.push(`${z.regel}: ${z.material_kurz || z.material}`);
    }
    return ok;
  });

  // vorhandene, noch nicht an flux gegebene Jobs dieses Auftrags ersetzen
  await sb
    .from("druckjob")
    .delete()
    .eq("portal_order_id", portalOrderId)
    .in("status", ["offen", "in_batch"]);

  const batchCache = new Map<string, { id: string; nummer: string }>();
  let batchesNeu = 0;

  async function batchFor(z: Zeile): Promise<{ id: string; nummer: string }> {
    const key = batchSchluessel({
      druckverfahren: rr!.druckverfahren ?? null,
      cello: z.cello ?? "keine",
      papier: z.material_kurz || z.material,
      druckbogen: z.druckbogen ?? null,
    });
    const cached = batchCache.get(key);
    if (cached) return cached;

    const { data: offen } = await sb
      .from("druck_batch")
      .select("id, nummer")
      .eq("schluessel", key)
      .in("status", ["offen", "bereit"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (offen) {
      const hit = { id: offen.id as string, nummer: offen.nummer as string };
      batchCache.set(key, hit);
      return hit;
    }

    const { data: nummerRow, error: nErr } = await sb.rpc("next_number", { p_key: "druck_batch" });
    if (nErr) throw new Error(`Batch-Nummer: ${nErr.message}`);
    const { data: neu, error: bErr } = await sb
      .from("druck_batch")
      .insert({
        nummer: nummerRow as unknown as string,
        schluessel: key,
        druckverfahren: rr!.druckverfahren ?? null,
        cello: z.cello ?? "keine",
        cello_seiten: z.cello_seiten ?? 1,
        papier: z.material_kurz || z.material,
        druckbogen: z.druckbogen ?? null,
      })
      .select("id, nummer")
      .single();
    if (bErr) throw new Error(`Batch anlegen: ${bErr.message}`);
    batchesNeu++;
    const hit = { id: neu.id as string, nummer: neu.nummer as string };
    batchCache.set(key, hit);
    return hit;
  }

  const perBatch = new Map<string, number>();
  for (const z of druckzeilen) {
    const batch = await batchFor(z);
    const services: Record<string, unknown> = { ...(z.flux_services ?? {}) };
    if (z.flux_paper_type) services["Papiersorte"] = z.flux_paper_type;
    if (z.flux_paper_type_back) services["Papiersorte Rückseite"] = z.flux_paper_type_back;

    const { error: jErr } = await sb.from("druckjob").insert({
      portal_order_id: portalOrderId,
      batch_id: batch.id,
      bauteil: z.verwendung || z.rolle || z.regel,
      quelle_regel: z.regel,
      papier: z.material_kurz || z.material,
      farbigkeit: (rr.attribute?.farbigkeit as string | undefined) ?? null,
      format: z.format || (rr.attribute?.format as string | undefined) || null,
      druckbogen: z.druckbogen ?? null,
      nutzen: z.nutzen ?? null,
      netto_bogen: z.netto_bogen ?? null,
      auflage,
      cello: z.cello ?? "keine",
      cello_seiten: z.cello_seiten ?? 1,
      flux_product: z.flux_product ?? fluxProductFallback,
      flux_services: services,
      flux_paper_type: z.flux_paper_type ?? null,
      flux_signature: z.flux_signature ?? null,
      flux_printer: z.flux_printer ?? null,
      pdf_storage_key: printKey,
      status: "in_batch",
    });
    if (jErr) throw new Error(`Druckjob: ${jErr.message}`);
    perBatch.set(batch.nummer, (perBatch.get(batch.nummer) ?? 0) + 1);
  }

  return {
    jobs: druckzeilen.length,
    batches_neu: batchesNeu,
    batches: [...batchCache.entries()].map(([schluessel, b]) => ({
      nummer: b.nummer,
      schluessel,
      jobs: perBatch.get(b.nummer) ?? 0,
    })),
    uebersprungen: [...new Set(uebersprungen)],
  };
}
