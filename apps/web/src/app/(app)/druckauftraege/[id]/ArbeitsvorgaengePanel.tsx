"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { DruckjobsButton } from "./DruckjobsButton";
import {
  addVersandTeillieferungAction,
  deleteJobDateiAction,
  saveJobFluxAction,
  sendeAuftragAnFluxAction,
  uploadJobDateiAction,
  type State,
} from "../actions";
import { paperGroup, groupByName, type ProductLite } from "@/lib/flux/productServices";

const empty: State = {};

export type JobDatei = {
  id: string;
  filename: string | null;
  bytes: number | null;
  herkunft: string;
  viewUrl: string | null;
  downloadUrl: string | null;
};

export type ArbeitsvorgangJob = {
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
  cello: string;
  cello_seiten: number;
  teilung: string | null;
  durchmesser: string | null;
  schlaufen_gesamt: number | null;
  komponenten: { quelle: string; bezeichnung: string | null; rolle?: string | null; menge?: number | null; einheit?: string | null }[] | null;
  status: string;
  flux_product: string | null;
  flux_signature: string | null;
  flux_printer: string | null;
  flux_paper_type: string | null;
  flux_services: Record<string, unknown> | null;
  flux_order_item_id: string | null;
  pdf: boolean;
  dateien: JobDatei[];
  batch: { nummer: string; typ: string; status: string } | null;
};

const F = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="bd-field" style={{ minWidth: 150 }}>
    <span className="bd-field-label">{label}</span>
    {children}
    {hint && <small className="bd-mute" style={{ fontSize: 12 }}>{hint}</small>}
  </label>
);

function kb(b: number | null) {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** Dateien, die für diesen Job an flux gehen - plus Upload zum Ergänzen/Tauschen. */
export function JobDateien({ orderId, job }: { orderId: string; job: ArbeitsvorgangJob }) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadJobDateiAction, empty);
  const [deleteState, deleteAction] = useActionState(deleteJobDateiAction, empty);

  return (
    <div style={{ marginTop: 12 }}>
      <strong style={{ fontSize: 13, fontFamily: "var(--font-bd-sans)" }}>Dateien für flux</strong>
      {job.dateien.length === 0 ? (
        <p className="bd-err" style={{ margin: "6px 0" }}>
          keine Druckdatei - ohne Upload kann dieser Vorgang nicht an flux übergeben werden
        </p>
      ) : (
        <table className="bd-table" style={{ marginTop: 6 }}>
          <tbody>
            {job.dateien.map((d) => (
              <tr key={d.id}>
                <td className="wrap">
                  {d.filename ?? "—"}
                  {d.herkunft === "upload" && <span className="bd-count" style={{ marginLeft: 6 }}>Upload</span>}
                </td>
                <td className="bd-num bd-mute">{kb(d.bytes)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {d.viewUrl && (
                    <a href={d.viewUrl} target="_blank" rel="noreferrer" className="bd-btn bd-btn-secondary bd-btn-sm" style={{ marginRight: 6 }}>
                      Öffnen
                    </a>
                  )}
                  <form action={deleteAction} style={{ display: "inline" }}>
                    <input type="hidden" name="datei_id" value={d.id} />
                    <input type="hidden" name="order_id" value={orderId} />
                    <button type="button" className="bd-btn bd-btn-secondary bd-btn-sm"
                      onClick={(e) => {
                        if (!confirm(`"${d.filename ?? "Datei"}" aus der Liste entfernen?`)) return;
                        (e.currentTarget.form as HTMLFormElement).requestSubmit();
                      }}
                    >
                      Entfernen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {deleteState.error && <div className="bd-err" style={{ marginTop: 4 }}>{deleteState.error}</div>}

      <form action={uploadAction} className="bd-actions" style={{ marginTop: 10 }}>
        <input type="hidden" name="job_id" value={job.id} />
        <input type="hidden" name="order_id" value={orderId} />
        <input type="file" name="file" accept="application/pdf" required />
        <button type="submit" className="bd-btn bd-btn-secondary bd-btn-sm" disabled={uploadPending}>
          {uploadPending ? "…" : "Datei hinzufügen"}
        </button>
        {uploadState.ok && <span className="bd-ok">✓ {uploadState.note}</span>}
        {uploadState.error && <span className="bd-err">{uploadState.error}</span>}
      </form>
      <p className="bd-mute" style={{ marginTop: 4 }}>
        Mehrere Dateien möglich (z. B. Umschlag + Inhalt getrennt geliefert). Zum Tauschen: alte
        Datei entfernen, neue hochladen.
      </p>
    </div>
  );
}

/** Flux-Formular eines Druck-Jobs (Produkt/Standbogen/Papier/Beidseitig/Farbe). */
export function FluxFelder({
  orderId,
  job,
  products,
  fluxUrlTpl,
}: {
  orderId: string;
  job: ArbeitsvorgangJob;
  products: ProductLite[];
  fluxUrlTpl?: string | null;
}) {
  const [state, action, pending] = useActionState(saveJobFluxAction, empty);
  const fluxUrl =
    fluxUrlTpl && job.flux_order_item_id
      ? fluxUrlTpl.replace("{orderItemId}", job.flux_order_item_id)
      : null;
  const [product, setProduct] = useState(job.flux_product ?? "");
  const selected = useMemo(() => products.find((p) => p.name === product), [products, product]);

  const paperG = useMemo(() => paperGroup(selected), [selected]);
  const beidseitigG = useMemo(() => groupByName(selected, "Beidseitig"), [selected]);
  const farbeG = useMemo(() => groupByName(selected, "Farbiger Druck"), [selected]);

  const svc = job.flux_services ?? {};
  const curBeid = (svc["Beidseitig"] as string) ?? "";
  const curFarbe = (svc["Farbiger Druck"] as string) ?? "";
  const produktFehlt = product.trim().length > 0 && products.length > 0 && !selected;

  return (
    <>
      {fluxUrl && (
        <div style={{ marginBottom: 10 }}>
          <a href={fluxUrl} target="_blank" rel="noreferrer" className="bd-btn bd-btn-secondary bd-btn-sm">
            flux öffnen →
          </a>
        </div>
      )}
      <form action={action} className="bd-form-col" style={{ maxWidth: "none" }}>
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="job_id" value={job.id} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <F label="flux-Produkt" hint={selected?.description}>
            <input className="bd-field-input"
              name="flux_product"
              list="flux-products"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Opri_…"
            />
          </F>

          <F label="Standbogen" hint="optional">
            <input className="bd-field-input" name="signature" defaultValue={job.flux_signature ?? ""} list="flux-signatures" />
          </F>

          <F label="Drucker" hint="optional">
            <input className="bd-field-input" name="printer" defaultValue={job.flux_printer ?? ""} list="flux-printers" />
          </F>

          <F
            label="Papiersorte"
            hint={paperG?.options.length ? "aus Produkt" : "aus Materialkatalog / frei"}
          >
            {paperG && paperG.options.length ? (
              <select className="bd-field-input" name="paper_type" defaultValue={job.flux_paper_type ?? ""}>
                <option value="">(Standard)</option>
                {paperG.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {job.flux_paper_type && !paperG.options.includes(job.flux_paper_type) && (
                  <option value={job.flux_paper_type}>{job.flux_paper_type}</option>
                )}
              </select>
            ) : (
              <input className="bd-field-input" name="paper_type" defaultValue={job.flux_paper_type ?? ""} list="flux-papers" />
            )}
          </F>

          <F label="Beidseitig" hint={beidseitigG?.def ? `Standard: ${beidseitigG.def}` : undefined}>
            <select className="bd-field-input" name="beidseitig" defaultValue={curBeid}>
              <option value="">(Standard)</option>
              {(beidseitigG?.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              {curBeid && !(beidseitigG?.options ?? []).includes(curBeid) && (
                <option value={curBeid}>{curBeid}</option>
              )}
            </select>
          </F>

          <F label="Farbe" hint={farbeG?.def ? `Standard: ${farbeG.def}` : undefined}>
            <select className="bd-field-input" name="farbe" defaultValue={curFarbe}>
              <option value="">(Standard)</option>
              {(farbeG?.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              {curFarbe && !(farbeG?.options ?? []).includes(curFarbe) && (
                <option value={curFarbe}>{curFarbe}</option>
              )}
            </select>
          </F>
        </div>

        <div className="bd-actions">
          <button type="submit" className="bd-btn bd-btn-primary" disabled={pending}>
            {pending ? "…" : "Speichern"}
          </button>
          {produktFehlt && <span className="bd-mute">Produkt nicht im flux-Katalog</span>}
          {state.ok && <span className="bd-ok">✓ {state.note}</span>}
          {state.error && <span className="bd-err">{state.error}</span>}
        </div>
      </form>

      <JobDateien orderId={orderId} job={job} />
    </>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <details style={{ marginTop: 6 }}>
      <summary className="bd-mute">{label}</summary>
      <pre
        style={{
          font: "11px ui-monospace, monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "var(--bd-surface-100)",
          border: "1px solid var(--bd-line)",
          borderRadius: "var(--bd-radius-sm)",
          padding: 8,
          marginTop: 6,
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/** Popup mit den flux-Details eines Druck-Vorgangs. */
function JobPopup({
  orderId,
  job,
  products,
  fluxUrlTpl,
  sentOrderId,
  onClose,
}: {
  orderId: string;
  job: ArbeitsvorgangJob;
  products: ProductLite[];
  fluxUrlTpl?: string | null;
  sentOrderId?: string | null;
  onClose: () => void;
}) {
  const [sendState, sendAction, sendPending] = useActionState(sendeAuftragAnFluxAction, empty);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "5vh 3vw",
        overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bd-paper)",
          border: "1px solid var(--bd-line)",
          borderRadius: "var(--bd-radius-md)",
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div
          className="bd-section-head"
          style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd-line)", marginBottom: 0 }}
        >
          <strong style={{ fontFamily: "var(--font-bd-display)", fontSize: 16 }}>{job.bauteil}</strong>
          <button type="button" className="bd-btn bd-btn-secondary bd-btn-sm" onClick={onClose}>
            Schließen
          </button>
        </div>
        <div style={{ padding: 14 }}>
          <FluxFelder orderId={orderId} job={job} products={products} fluxUrlTpl={fluxUrlTpl} />

          <form action={sendAction} className="bd-actions" style={{ marginTop: 14, borderTop: "1px solid var(--bd-line)", paddingTop: 12 }}>
            <input type="hidden" name="id" value={orderId} />
            <button type="submit" className="bd-btn bd-btn-primary" disabled={sendPending}>
              {sendPending ? "…" : sentOrderId ? "erneut an flux senden" : "Auftrag an flux senden"}
            </button>
            <span className="bd-mute">
              {sentOrderId
                ? `gesendet · flux ${sentOrderId}`
                : "übergibt alle Druck-Vorgänge dieses Auftrags an flux"}
            </span>
            {sendState.ok && <span className="bd-ok">✓ {sendState.note}</span>}
            {sendState.error && <span className="bd-err">{sendState.error}</span>}
          </form>
        </div>
      </div>
    </div>
  );
}

/** Weiteren Versand-Vorgang anlegen (Teillieferung) - zusätzlich zu dem einen,
 *  den "Jobs erzeugen" automatisch mit der vollen Auftragsmenge erzeugt. */
function VersandTeillieferungForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(addVersandTeillieferungAction, empty);
  return (
    <form action={action} className="bd-actions" style={{ marginTop: 12 }}>
      <input type="hidden" name="order_id" value={orderId} />
      <input className="bd-field-input" name="menge" type="number" min={1} step={1} placeholder="Menge" style={{ width: 90 }} required />
      <button type="submit" disabled={pending} className="bd-btn bd-btn-secondary">
        {pending ? "…" : "+ Versand-Vorgang (Teillieferung)"}
      </button>
      {state.ok && <span className="bd-ok">✓ {state.note}</span>}
      {state.error && <span className="bd-err">{state.error}</span>}
    </form>
  );
}

export function ArbeitsvorgaengePanel({
  orderId,
  jobs,
  products,
  signatures,
  paperTypes,
  printers,
  catalogError,
  sentOrderId,
  fluxUrlTpl,
  lastSentAt,
  lastPayload,
  lastResponse,
}: {
  orderId: string;
  jobs: ArbeitsvorgangJob[];
  products: ProductLite[];
  signatures: string[];
  paperTypes: string[];
  printers: string[];
  catalogError?: string;
  sentOrderId?: string | null;
  fluxUrlTpl?: string | null;
  lastSentAt?: string | null;
  lastPayload?: unknown;
  lastResponse?: unknown;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sendState, sendAction, sendPending] = useActionState(sendeAuftragAnFluxAction, empty);
  const druckJobs = jobs.filter((j) => j.typ === "druck");
  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <>
      <div className="bd-section-head">
        <h2>
          Arbeitsvorgänge {jobs.length > 0 && <span className="bd-count">{jobs.length}</span>}
        </h2>
        <DruckjobsButton id={orderId} />
      </div>

      {jobs.length === 0 ? (
        <p className="bd-mute">
          Noch keine Jobs. „Jobs erzeugen" legt Druck-, Cello-, Binde- und Aufhänger-Vorgänge
          an und sortiert sie in Batches.
        </p>
      ) : (
        <>
          <p className="bd-mute" style={{ marginTop: 0, marginBottom: 12 }}>
            Druck-Vorgänge anklicken, um flux-Produkt, Dateien und Overrides zu setzen.
          </p>
          <div className="table-scroll">
            <table className="bd-table">
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Bauteil</th>
                  <th>Papier / Farbe</th>
                  <th className="bd-num">Menge</th>
                  <th>Cello / Wire-O</th>
                  <th>Batch</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const klickbar = j.typ === "druck";
                  return (
                    <tr
                      key={j.id}
                      onClick={klickbar ? () => setSelectedId(j.id) : undefined}
                      style={klickbar ? { cursor: "pointer" } : undefined}
                    >
                      <td><span className="bd-count">{j.typ}</span></td>
                      <td>
                        {j.bauteil}
                        {klickbar && !j.dateien.length && <span className="bd-err" style={{ marginLeft: 8 }}>keine Datei</span>}
                        {j.flux_order_item_id && <span className="bd-count" style={{ marginLeft: 8 }}>an flux</span>}
                        {j.komponenten && j.komponenten.length > 0 && (
                          <span className="bd-sub">
                            führt zusammen:{" "}
                            {j.komponenten
                              .map(
                                (k) =>
                                  `${k.bezeichnung ?? "?"}${
                                    k.menge != null ? ` (${k.menge.toLocaleString("de-DE")}${k.einheit ? " " + k.einheit : ""})` : ""
                                  }`,
                              )
                              .join("  +  ")}
                          </span>
                        )}
                      </td>
                      <td>
                        {j.papier ?? "—"}
                        {j.farbigkeit ? ` · ${j.farbigkeit}` : ""}
                        {j.format ? ` · ${j.format}` : ""}
                      </td>
                      <td className="bd-num">
                        {j.typ === "druck"
                          ? `${j.netto_bogen ?? "—"}${j.druckbogen ? ` ${j.druckbogen}` : ""}${j.nutzen ? ` (${j.nutzen}-up)` : ""}`
                          : j.typ === "binden"
                            ? `${j.schlaufen_gesamt?.toLocaleString("de-DE") ?? "—"} Schlaufen`
                            : `${j.auflage.toLocaleString("de-DE")} Expl.`}
                      </td>
                      <td>
                        {j.cello !== "keine"
                          ? `Cello ${j.cello}, ${j.cello_seiten}-seitig`
                          : j.durchmesser || j.teilung
                            ? [j.teilung, j.durchmesser].filter(Boolean).join(" · ")
                            : "—"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {j.batch ? <Link className="bd-link" href="/druck">{j.batch.nummer}</Link> : "—"}
                      </td>
                      <td><span className="bd-status t-neutral"><span className="bd-status-mark" />{j.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <VersandTeillieferungForm orderId={orderId} />

          {druckJobs.length > 0 && (
            <>
              {catalogError && (
                <div className="bd-hint" style={{ color: "var(--bd-danger)" }}>
                  flux-Katalog nicht erreichbar ({catalogError}).
                </div>
              )}

              <datalist id="flux-products">
                {products.map((p) => (
                  <option key={p.name} value={p.name} />
                ))}
              </datalist>
              <datalist id="flux-signatures">
                {signatures.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <datalist id="flux-printers">
                {printers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <datalist id="flux-papers">
                {paperTypes.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>

              <form action={sendAction} className="bd-actions" style={{ marginTop: 16 }}>
                <input type="hidden" name="id" value={orderId} />
                <button type="submit" className="bd-btn bd-btn-primary" disabled={sendPending}>
                  {sendPending ? "…" : sentOrderId ? "erneut an flux senden" : "Auftrag an flux senden"}
                </button>
                {sentOrderId && (
                  <span className="bd-mute">
                    gesendet · flux {sentOrderId} (Druck-Vorgang anklicken für „flux öffnen")
                  </span>
                )}
                {sendState.ok && <span className="bd-ok">✓ {sendState.note}</span>}
                {sendState.error && <span className="bd-err">{sendState.error}</span>}
              </form>

              {(lastPayload != null || lastResponse != null) && (
                <div style={{ marginTop: 10 }}>
                  <div className="bd-mute">
                    letzte Übergabe{lastSentAt ? ` · ${new Date(lastSentAt).toLocaleString("de-DE")}` : ""}
                  </div>
                  <Json label="→ gesendetes Payload" value={lastPayload} />
                  <Json label="← Antwort von flux" value={lastResponse} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {selected && (
        <JobPopup
          orderId={orderId}
          job={selected}
          products={products}
          fluxUrlTpl={fluxUrlTpl}
          sentOrderId={sentOrderId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
