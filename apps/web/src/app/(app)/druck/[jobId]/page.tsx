import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { fmtDate } from "@/lib/format";

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
  verfahren: string | null;
  status: string;
  notiz: string | null;
  portal_order_id: string | null;
  flux_product: string | null;
  flux_signature: string | null;
  flux_printer: string | null;
  flux_paper_type: string | null;
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
        "teilung, durchmesser, schlaufen, schlaufen_gesamt, verfahren, status, notiz, portal_order_id, " +
        "flux_product, flux_signature, flux_printer, flux_paper_type, flux_order_id, flux_order_item_id, flux_status, " +
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
        ...d,
        viewUrl: await signedGetUrl(d.storage_key, 1800),
        downloadUrl: await signedGetUrl(d.storage_key, 1800, d.filename ?? undefined),
      }),
    ),
  );

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

      <h2 style={{ marginTop: 22 }}>flux</h2>
      <dl className="kv">
        <dt>Produkt</dt>
        <dd>{job.flux_product ?? "—"}</dd>
        <dt>Standbogen</dt>
        <dd>{job.flux_signature ?? "—"}</dd>
        <dt>Papiersorte</dt>
        <dd>{job.flux_paper_type ?? "—"}</dd>
        <dt>Drucker</dt>
        <dd>{job.flux_printer ?? "—"}</dd>
        <dt>Auftrag/Position</dt>
        <dd>
          {job.flux_order_id ?? "—"}
          {job.flux_order_item_id ? ` / ${job.flux_order_item_id}` : ""}
        </dd>
        <dt>Status</dt>
        <dd>{job.flux_status ?? "—"}</dd>
      </dl>

      <h2 style={{ marginTop: 22 }}>Dateien</h2>
      {dateien.length === 0 ? (
        <p className="count">Keine Dateien.</p>
      ) : (
        <div className="rows">
          {dateien.map((d) => (
            <div key={d.id} className="row">
              {d.viewUrl ? (
                <a href={d.viewUrl} target="_blank" rel="noreferrer" className="w-name">
                  {d.filename ?? d.id}
                </a>
              ) : (
                <span className="w-name">{d.filename ?? d.id}</span>
              )}
              <span className="count">{d.herkunft}</span>
              {d.downloadUrl && (
                <a href={d.downloadUrl} className="ghost" style={{ padding: "4px 10px" }}>
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
