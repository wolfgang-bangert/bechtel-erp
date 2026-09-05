/**
 * Erzeugt aus der Auflösung eines Auftrags (portal_order.resolve_result) die
 * Arbeitsvorgänge (job) und ordnet sie Batches zu.
 *
 *   druck      – jede bedruckte Bogen/Blatt-Zeile (außer Graukarton/Graupappe)
 *                Batch-Schlüssel: verfahren | cello | papier | druckbogen  → flux
 *   cello      – wenn eine Zeile cello ≠ keine trägt
 *                Batch-Schlüssel: matt|glanz | papier  (nach dem Umschlag-Druck)
 *   binden     – wenn eine Wire-O-Zeile da ist
 *                Batch-Schlüssel: teilung | durchmesser  (nach allen Druck-/Cello-Jobs)
 *   aufhaenger – wenn Kalenderaufhänger; nach dem Binden
 *
 * abhaengig_von hält die Reihenfolge fürs spätere Planungsboard.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolveResult } from "@/lib/opri/resolve";

type Zeile = ResolveResult["materialliste"][number];
type Typ = "druck" | "cello" | "binden" | "aufhaenger" | "konfektion";

const NICHT_BEDRUCKT = /graukarton|graupappe|graukart/i;
const IST_WIREO = /drahtbinder|wire-?o/i;
const IST_AUFHAENGER = /aufh[äa]nger/i;
const IST_INLAY = /inlay/i;

const norm = (v: unknown) => (v == null ? "" : String(v).trim());

function istDruckzeile(z: Zeile): boolean {
  if (z.bedruckt === false) return false;
  if (z.einheit !== "bogen" && z.einheit !== "blatt") return false;
  if (!z.material && !z.material_kurz) return false;
  if (NICHT_BEDRUCKT.test(`${z.material ?? ""} ${z.material_kurz ?? ""} ${z.rolle ?? ""}`)) return false;
  return true;
}
const istWireOzeile = (z: Zeile) => z.teilung != null || IST_WIREO.test(z.rolle ?? "");
const istAufhaengerZeile = (z: Zeile) => IST_AUFHAENGER.test(`${z.rolle ?? ""} ${z.verwendung ?? ""}`);

export type MaterializeResult = {
  jobs: number;
  nach_typ: Record<string, number>;
  batches_neu: number;
  batches: { nummer: string; typ: string; schluessel: string; jobs: number }[];
  uebersprungen: string[];
};

export async function erzeugeJobs(
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

  // flux_product-Fallback (Stammartikel → Gruppe → flux_template), nur wenn die
  // Zeile selbst kein Template aufgelöst hat.
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
  const verfahren = rr.druckverfahren ?? null;
  const farbigkeit = (rr.attribute?.farbigkeit as string | undefined) ?? null;
  const uebersprungen: string[] = [];

  const zeilen = rr.materialliste ?? [];
  const druckzeilen = zeilen.filter((z) => {
    const ok = istDruckzeile(z);
    if (!ok && (z.material || z.material_kurz) && !istWireOzeile(z) && !istAufhaengerZeile(z)) {
      uebersprungen.push(`${z.regel}: ${z.material_kurz || z.material}`);
    }
    return ok;
  });
  const celloZeilen = zeilen.filter((z) => (z.cello ?? "keine") !== "keine");
  const wireOzeile = zeilen.find(istWireOzeile) ?? null;
  const hatAufhaenger = rr.attribute?.kalenderaufhaenger === true || zeilen.some(istAufhaengerZeile);

  // vorhandene, noch nicht übergebene Jobs dieses Auftrags ersetzen
  await sb
    .from("job")
    .delete()
    .eq("portal_order_id", portalOrderId)
    .in("status", ["offen", "in_batch"]);

  // ---- Batch-Zuordnung -----------------------------------------------------
  const batchCache = new Map<string, { id: string; nummer: string }>();
  let batchesNeu = 0;
  const perBatch = new Map<string, { typ: string; schluessel: string; jobs: number }>();

  async function getBatch(
    typ: Typ,
    schluessel: string,
    meta: Record<string, unknown>,
  ): Promise<{ id: string; nummer: string }> {
    const cacheKey = `${typ}::${schluessel}`;
    const cached = batchCache.get(cacheKey);
    if (cached) return cached;

    const { data: offen } = await sb
      .from("batch")
      .select("id, nummer")
      .eq("typ", typ)
      .eq("schluessel", schluessel)
      .in("status", ["offen", "bereit"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (offen) {
      const hit = { id: offen.id as string, nummer: offen.nummer as string };
      batchCache.set(cacheKey, hit);
      perBatch.set(hit.nummer, { typ, schluessel, jobs: 0 });
      return hit;
    }

    const { data: nummerRow, error: nErr } = await sb.rpc("next_number", { p_key: "batch" });
    if (nErr) throw new Error(`Batch-Nummer: ${nErr.message}`);
    const { data: neu, error: bErr } = await sb
      .from("batch")
      .insert({ nummer: nummerRow as unknown as string, typ, schluessel, ...meta })
      .select("id, nummer")
      .single();
    if (bErr) throw new Error(`Batch anlegen: ${bErr.message}`);
    batchesNeu++;
    const hit = { id: neu.id as string, nummer: neu.nummer as string };
    batchCache.set(cacheKey, hit);
    perBatch.set(hit.nummer, { typ, schluessel, jobs: 0 });
    return hit;
  }

  const bump = (nummer: string) => {
    const e = perBatch.get(nummer);
    if (e) e.jobs++;
  };

  // ---- 1) Druck-Jobs -----------------------------------------------------
  const druckJobs: { id: string; bauteil: string; netto_bogen: number | null; druckbogen: string | null }[] = [];
  const celloDruckJobIds: string[] = [];
  for (const z of druckzeilen) {
    const papier = z.material_kurz || z.material;
    const schluessel = [norm(verfahren), z.cello ?? "keine", norm(papier), norm(z.druckbogen)].join(" | ");
    const batch = await getBatch("druck", schluessel, {
      druckverfahren: verfahren,
      cello: z.cello ?? "keine",
      cello_seiten: z.cello_seiten ?? 1,
      papier,
      druckbogen: z.druckbogen ?? null,
    });

    const services: Record<string, unknown> = { ...(z.flux_services ?? {}) };
    if (z.flux_paper_type) services["Papiersorte"] = z.flux_paper_type;
    if (z.flux_paper_type_back) services["Papiersorte Rückseite"] = z.flux_paper_type_back;

    const { data: j, error: jErr } = await sb
      .from("job")
      .insert({
        portal_order_id: portalOrderId,
        batch_id: batch.id,
        typ: "druck",
        bauteil: z.verwendung || z.rolle || z.regel,
        quelle_regel: z.regel,
        papier,
        farbigkeit,
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
      })
      .select("id")
      .single();
    if (jErr) throw new Error(`Druckjob: ${jErr.message}`);
    druckJobs.push({ id: j.id as string, bauteil: z.verwendung || z.rolle || z.regel, netto_bogen: z.netto_bogen ?? null, druckbogen: z.druckbogen ?? null });
    if ((z.cello ?? "keine") !== "keine") celloDruckJobIds.push(j.id as string);
    bump(batch.nummer);
  }
  const druckJobIds = druckJobs.map((d) => d.id);

  // ---- 2) Cello-Job ----------------------------------------------------
  const celloJobIds: string[] = [];
  if (celloZeilen.length) {
    const cz = celloZeilen[0];
    const cello = cz.cello ?? "matt";
    const papier = cz.material_kurz || cz.material;
    const schluessel = [cello, norm(papier)].join(" | ");
    const batch = await getBatch("cello", schluessel, {
      cello,
      cello_seiten: cz.cello_seiten ?? 1,
      papier,
    });
    const { data: j, error: jErr } = await sb
      .from("job")
      .insert({
        portal_order_id: portalOrderId,
        batch_id: batch.id,
        typ: "cello",
        bauteil: `Cellophanieren ${cello}${cz.cello_seiten === 2 ? " (2-seitig)" : ""}`,
        quelle_regel: cz.regel,
        papier,
        auflage,
        cello,
        cello_seiten: cz.cello_seiten ?? 1,
        abhaengig_von: celloDruckJobIds,
        status: "in_batch",
      })
      .select("id")
      .single();
    if (jErr) throw new Error(`Cello-Job: ${jErr.message}`);
    celloJobIds.push(j.id as string);
    bump(batch.nummer);
  } else if ((rr.attribute?.cello as string | undefined) && (rr.attribute?.cello as string) !== "keine") {
    uebersprungen.push(`Cello ${rr.attribute?.cello} erkannt, aber keine Regel trägt sie (traegt_cello)`);
  }

  // ---- 3) Binde-Job --------------------------------------------------
  // Der Binde-Job führt zusammen: die Druck-Vorgänge + alle nicht-gedruckten
  // Teile (Aufsteller, Graupappe, Wire-O, …). Das steckt in komponenten[].
  const bindeJobIds: string[] = [];
  if (wireOzeile) {
    const z = wireOzeile;
    const schluessel = [norm(z.teilung), norm(z.durchmesser)].join(" | ");
    const batch = await getBatch("binden", schluessel, {});

    const komponenten: Record<string, unknown>[] = [
      ...druckJobs.map((d) => ({
        quelle: "druck",
        ref: d.id,
        bezeichnung: d.bauteil,
        menge: d.netto_bogen,
        einheit: d.druckbogen ? `Bogen ${d.druckbogen}` : "Bogen",
      })),
      ...celloJobIds.map((id) => ({ quelle: "job", ref: id, bezeichnung: "Cellophanieren" })),
      ...zeilen
        .filter((x) => x !== z && !druckzeilen.includes(x) && (x.material || x.material_kurz))
        .map((x) => ({
          quelle: "material",
          bezeichnung: x.material_kurz || x.material,
          rolle: x.rolle,
          menge: x.netto_bogen ?? x.menge,
          einheit: x.netto_bogen ? `Bogen ${x.druckbogen ?? ""}`.trim() : x.einheit,
        })),
      {
        quelle: "material",
        bezeichnung: z.material_kurz || z.material,
        rolle: z.rolle,
        menge: z.schlaufen_gesamt ?? auflage,
        einheit: z.schlaufen_gesamt ? "Schlaufen" : "Stück",
      },
    ];

    const { data: j, error: jErr } = await sb
      .from("job")
      .insert({
        portal_order_id: portalOrderId,
        batch_id: batch.id,
        typ: "binden",
        bauteil: `Wire-O binden${z.durchmesser ? ` ${z.durchmesser}` : ""}`,
        quelle_regel: z.regel,
        auflage,
        teilung: z.teilung ?? null,
        durchmesser: z.durchmesser ?? null,
        schlaufen: z.schlaufen ?? null,
        schlaufen_gesamt: z.schlaufen_gesamt ?? null,
        bindeseite: z.bindeseite ?? null,
        abhaengig_von: [...druckJobIds, ...celloJobIds],
        komponenten,
        status: "in_batch",
      })
      .select("id")
      .single();
    if (jErr) throw new Error(`Binde-Job: ${jErr.message}`);
    bindeJobIds.push(j.id as string);
    bump(batch.nummer);
  }

  // ---- 4) Aufhänger-Job --------------------------------------------
  if (hatAufhaenger) {
    const batch = await getBatch("aufhaenger", "aufhaenger", {});
    const { error: jErr } = await sb.from("job").insert({
      portal_order_id: portalOrderId,
      batch_id: batch.id,
      typ: "aufhaenger",
      bauteil: "Kalenderaufhänger montieren",
      auflage,
      abhaengig_von: bindeJobIds.length ? bindeJobIds : druckJobIds,
      komponenten: [
        ...(bindeJobIds.length
          ? [{ quelle: "job", ref: bindeJobIds[0], bezeichnung: "gebundener Block" }]
          : druckJobs.map((d) => ({ quelle: "druck", ref: d.id, bezeichnung: d.bauteil }))),
        { quelle: "material", bezeichnung: "Kalenderaufhänger", menge: auflage, einheit: "Stück" },
      ],
      status: "in_batch",
    });
    if (jErr) throw new Error(`Aufhänger-Job: ${jErr.message}`);
    bump(batch.nummer);
  }

  // ---- 5) Konfektion (Multiloft: Cover + Inlay + Cover stapeln, Nutzen schneiden)
  const inlayZeile = zeilen.find(
    (z) => IST_INLAY.test(z.rolle ?? "") || IST_INLAY.test(z.verwendung ?? ""),
  );
  if (inlayZeile) {
    const dbogen = inlayZeile.druckbogen ?? druckJobs[0]?.druckbogen ?? null;
    const fmt = inlayZeile.format ?? (rr.attribute?.format as string | undefined) ?? null;
    const schluessel = [norm(fmt), norm(dbogen)].join(" | ");
    const batch = await getBatch("konfektion", schluessel, { papier: fmt, druckbogen: dbogen });

    // alle nicht bedruckten Bogen-Zeilen (Inlay, Blanko-Rückblatt) als Material
    const matZeilen = zeilen.filter(
      (z) =>
        z !== inlayZeile &&
        z.bedruckt === false &&
        (z.einheit === "bogen" || z.einheit === "blatt") &&
        (z.material || z.material_kurz),
    );
    const komponenten: Record<string, unknown>[] = [
      ...druckJobs.map((d) => ({
        quelle: "druck",
        ref: d.id,
        bezeichnung: d.bauteil,
        menge: d.netto_bogen,
        einheit: d.druckbogen ? `Bogen ${d.druckbogen}` : "Bogen",
      })),
      {
        quelle: "material",
        bezeichnung: inlayZeile.material_kurz || inlayZeile.material,
        rolle: inlayZeile.rolle,
        menge: inlayZeile.netto_bogen ?? inlayZeile.menge,
        einheit: inlayZeile.netto_bogen ? `Bogen ${inlayZeile.druckbogen ?? ""}`.trim() : inlayZeile.einheit,
      },
      ...matZeilen.map((z) => ({
        quelle: "material",
        bezeichnung: z.material_kurz || z.material,
        rolle: z.rolle,
        menge: z.netto_bogen ?? z.menge,
        einheit: z.netto_bogen ? `Bogen ${z.druckbogen ?? ""}`.trim() : z.einheit,
      })),
    ];

    const { error: jErr } = await sb.from("job").insert({
      portal_order_id: portalOrderId,
      batch_id: batch.id,
      typ: "konfektion",
      bauteil: "Multiloft konfektionieren (Cover + Inlay + Cover, Nutzen schneiden)",
      quelle_regel: inlayZeile.regel,
      papier: fmt,
      druckbogen: dbogen,
      nutzen: inlayZeile.nutzen ?? null,
      netto_bogen: inlayZeile.netto_bogen ?? null,
      auflage,
      abhaengig_von: druckJobIds,
      komponenten,
      status: "in_batch",
    });
    if (jErr) throw new Error(`Konfektion-Job: ${jErr.message}`);
    bump(batch.nummer);
  }

  const alle = [...perBatch.entries()];
  const nachTyp: Record<string, number> = {};
  let jobsGesamt = 0;
  for (const [, e] of alle) {
    nachTyp[e.typ] = (nachTyp[e.typ] ?? 0) + e.jobs;
    jobsGesamt += e.jobs;
  }

  return {
    jobs: jobsGesamt,
    nach_typ: nachTyp,
    batches_neu: batchesNeu,
    batches: alle.map(([nummer, e]) => ({ nummer, typ: e.typ, schluessel: e.schluessel, jobs: e.jobs })),
    uebersprungen: [...new Set(uebersprungen)],
  };
}
