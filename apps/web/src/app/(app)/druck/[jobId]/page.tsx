import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { loadCatalogForForm } from "@/lib/flux/loadCatalog";
import { FluxFelder, JobDateien, type ArbeitsvorgangJob } from "../../druckauftraege/[id]/ArbeitsvorgaengePanel";

export const dynamic = "force-dynamic";

type JobDetail = {
  id: string;
  typ: string;
  bauteil: string;
  papier: string | null;
  farbigkeit: string | null;
  format: string | null;
  druckbogen: string | null;
  nutzen: number | null;
  netto_bogen: number | null;
  auflage: number;
  zuschuss: number;
  cello: string;
  cello_seiten: number;
  teilung: string | null;
  durchmesser: string | null;
  schlaufen: number | null;
  schlaufen_gesamt: number | null;
  komponenten: ArbeitsvorgangJob["komponenten"];
  verfahren: string | null;
  status: string;
  notiz: string | null;
  portal_order_id: string | null;
  flux_product: string | null;
  flux_signature: string | null;
  flux_printer: string | null;
  flux_paper_type: string | null;
  flux_services: Record<string, unknown> | null;
  flux_order_id: string | null;
  flux_order_item_id: string | null;
  flux_status: string | null;
  batch: { id: string; nummer: string; typ: string; status: string } | null;
  order: {
    external_reference: string | null;
    deliver_date: string | null;
    gruppe: string | null;
  } | null;
};

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();

  const { data: jobRaw } = await supabase
    .from("job")
    .select(
      "id, typ, bauteil, papier, farbigkeit, format, druckbogen, nutzen, netto_bogen, auflage, zuschuss, cello, cello_seiten, " +
        "teilung, durchmesser, schlaufen, schlaufen_gesamt, komponenten, verfahren, status, notiz, portal_order_id, " +
        "flux_product, flux_signature, flux_printer, flux_paper_type, flux_services, flux_order_id, flux_order_item_id, flux_status, " +
        "batch:batch_id(id, nummer, typ, status), " +
        "order:portal_order_id(external_reference, deliver_date, gruppe:resolve_result->>gruppe)",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!jobRaw) notFound();
  const job = jobRaw as unknown as JobDetail;

  const { data: dateienRaw } = await supabase
    .from("job_datei")
    .select("id, storage_key, filename, bytes, herkunft, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const dateien = await Promise.all(
    ((dateienRaw ?? []) as { id: string; storage_key: string; filename: string | null; bytes: number | null; herkunft: string }[]).map(
      async (d) => ({
        id: d.id,
        filename: d.filename,
        bytes: d.bytes,
        herkunft: d.herkunft,
        viewUrl: await signedGetUrl(d.storage_key, 1800),
        downloadUrl: await signedGetUrl(d.storage_key, 1800, d.filename ?? undefined),
      }),
    ),
  );

  const avJob: ArbeitsvorgangJob = {
    id: job.id,
    typ: job.typ,
    bauteil: job.bauteil,
    papier: job.papier,
    farbigkeit: job.farbigkeit,
    format: job.format,
    druckbogen: job.druckbogen,
    nutzen: job.nutzen,
    netto_bogen: job.netto_bogen,
    auflage: job.auflage,
    cello: job.cello,
    cello_seiten: job.cello_seiten,
    teilung: job.teilung,
    durchmesser: job.durchmesser,
    schlaufen_gesamt: job.schlaufen_gesamt,
    komponenten: job.komponenten,
    status: job.status,
    flux_product: job.flux_product,
    flux_signature: job.flux_signature,
    flux_printer: job.flux_printer,
    flux_paper_type: job.flux_paper_type,
    flux_services: job.flux_services,
    flux_order_item_id: job.flux_order_item_id,
    pdf: dateien.length > 0,
    dateien,
    batch: job.batch,
  };

  let cat: Awaited<ReturnType<typeof loadCatalogForForm>> | null = null;
  let fluxUrlTpl: string | null = null;
  if (job.typ === "druck") {
    cat = await loadCatalogForForm();
    const { data: fluxUrlRow } = await supabase
      .from("setting")
      .select("value")
      .eq("key", "flux_order_url_tpl")
      .maybeSingle();
    fluxUrlTpl = (fluxUrlRow?.value as string | null) ?? null;
  }

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>
          {job.bauteil} <span className="tag">{job.typ}</span>
        </h1>
        <div className="toolbar" style={{ gap: 8 }}>
          {job.batch && (
            <Link href={`/druck#${job.batch.nummer}`} className="ghost" style={{ padding: "7px 12px" }}>
              Zum Batch {job.batch.nummer} →
            </Link>
          )}
          {job.portal_order_id && (
            <Link href={`/druckauftraege/${job.portal_order_id}`} className="ghost" style={{ padding: "7px 12px" }}>
              Zum Auftrag →
            </Link>
          )}
          <Link href="/druck" className="ghost" style={{ padding: "7px 12px" }}>
            ← Dashboard
          </Link>
        </div>
      </div>
      <p className="lead">
        {job.order?.external_reference ?? "—"}
        {job.order?.deliver_date ? ` · Liefertermin ${fmtDate(job.order.deliver_date)}` : ""}
        {" · "}
        <span className="count">{job.status}</span>
      </p>

      <h2>Details</h2>
      <dl className="kv">
        <dt>Papier</dt>
        <dd>{job.papier ?? "—"}</dd>
        <dt>Farbigkeit</dt>
        <dd>{job.farbigkeit ?? "—"}</dd>
        <dt>Format</dt>
        <dd>{job.format ?? "—"}</dd>
        <dt>Druckbogen</dt>
        <dd>{job.druckbogen ?? "—"}</dd>
        <dt>Nutzen</dt>
        <dd>{job.nutzen ?? "—"}</dd>
        <dt>Netto-Bogen</dt>
        <dd>{job.netto_bogen != null ? job.netto_bogen.toLocaleString("de-DE") : "—"}</dd>
        <dt>Auflage</dt>
        <dd>{job.auflage.toLocaleString("de-DE")}</dd>
        <dt>Zuschuss</dt>
        <dd>{job.zuschuss.toLocaleString("de-DE")}</dd>
        <dt>Cello</dt>
        <dd>{job.cello !== "keine" ? `${job.cello} · ${job.cello_seiten}-seitig` : "keine"}</dd>
        <dt>Verfahren</dt>
        <dd>{job.verfahren ?? "—"}</dd>
        {(job.teilung || job.durchmesser || job.schlaufen_gesamt != null) && (
          <>
            <dt>Wire-O</dt>
            <dd>
              {[
                job.teilung && `Teilung ${job.teilung}`,
                job.durchmesser && `Ø ${job.durchmesser}`,
                job.schlaufen && `${job.schlaufen} Schlaufen/Expl.`,
                job.schlaufen_gesamt != null && `${job.schlaufen_gesamt.toLocaleString("de-DE")} gesamt`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </dd>
          </>
        )}
        <dt>Notiz</dt>
        <dd>{job.notiz ?? "—"}</dd>
      </dl>

      <h2 style={{ marginTop: 22 }}>flux & Dateien</h2>
      {job.typ === "druck" && cat ? (
        <>
          {cat.catalogError && (
            <div className="banner-err" style={{ marginBottom: 10 }}>
              flux-Katalog nicht erreichbar ({cat.catalogError}).
            </div>
          )}
          <datalist id="flux-products">
            {cat.products.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
          <datalist id="flux-signatures">
            {cat.signatures.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="flux-printers">
            {cat.printers.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <datalist id="flux-papers">
            {cat.paperTypes.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {job.portal_order_id ? (
            <FluxFelder orderId={job.portal_order_id} job={avJob} products={cat.products} fluxUrlTpl={fluxUrlTpl} />
          ) : (
            <p className="count">Kein zugehöriger Auftrag - flux-Übergabe nicht möglich.</p>
          )}
        </>
      ) : job.portal_order_id ? (
        <JobDateien orderId={job.portal_order_id} job={avJob} />
      ) : (
        <p className="count">Kein zugehöriger Auftrag - keine Dateiverwaltung möglich.</p>
      )}
    </>
  );
}
