"use client";

import { useActionState, useMemo, useState } from "react";
import { saveJobFluxAction, sendeAuftragAnFluxAction, type State } from "../actions";
import {
  paperGroup,
  groupByName,
  type ProductLite,
} from "@/lib/flux/productServices";

const empty: State = {};

export type FluxJob = {
  id: string;
  bauteil: string;
  flux_product: string | null;
  flux_signature: string | null;
  flux_paper_type: string | null;
  flux_printer: string | null;
  flux_services: Record<string, unknown> | null;
  flux_order_item_id: string | null;
  pdf: boolean;
};

const F = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="field" style={{ minWidth: 150 }}>
    <span>{label}</span>
    {children}
    {hint && <small className="count">{hint}</small>}
  </label>
);

function JobRow({
  orderId,
  job,
  products,
  fluxUrlTpl,
}: {
  orderId: string;
  job: FluxJob;
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
    <form
      action={action}
      className="rows"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 12,
        marginBottom: 10,
      }}
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="job_id" value={job.id} />

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <span className="toolbar" style={{ gap: 8 }}>
          <strong>{job.bauteil}</strong>
          {fluxUrl && (
            <a href={fluxUrl} target="_blank" rel="noreferrer" className="ghost" style={{ padding: "3px 9px", fontSize: 12 }}>
              flux öffnen →
            </a>
          )}
        </span>
        {!job.pdf && <span className="msg-err">keine Druckdatei</span>}
      </div>

      <div className="row" style={{ border: "none", padding: 0, flexWrap: "wrap", gap: 12 }}>
        <F label="flux-Produkt" hint={selected?.description}>
          <input
            name="flux_product"
            list="flux-products"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Opri_…"
          />
        </F>

        <F label="Standbogen" hint="optional">
          <input name="signature" defaultValue={job.flux_signature ?? ""} list="flux-signatures" />
        </F>

        <F label="Drucker" hint="optional">
          <input name="printer" defaultValue={job.flux_printer ?? ""} list="flux-printers" />
        </F>

        <F
          label="Papiersorte"
          hint={paperG?.options.length ? "aus Produkt" : "aus Materialkatalog / frei"}
        >
          {paperG && paperG.options.length ? (
            <select name="paper_type" defaultValue={job.flux_paper_type ?? ""}>
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
            <input name="paper_type" defaultValue={job.flux_paper_type ?? ""} list="flux-papers" />
          )}
        </F>

        <F label="Beidseitig" hint={beidseitigG?.def ? `Standard: ${beidseitigG.def}` : undefined}>
          <select name="beidseitig" defaultValue={curBeid}>
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
          <select name="farbe" defaultValue={curFarbe}>
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

      <div className="toolbar" style={{ gap: 10 }}>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
        {produktFehlt && <span className="count">Produkt nicht im flux-Katalog</span>}
        {state.ok && <span className="msg-ok">✓ {state.note}</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <details style={{ marginTop: 6 }}>
      <summary className="count">{label}</summary>
      <pre
        style={{
          font: "11px ui-monospace, monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
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

export function FluxSendPanel({
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
  jobs: FluxJob[];
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
  const [state, action, pending] = useActionState(sendeAuftragAnFluxAction, empty);

  if (!jobs.length) {
    return <p className="lead">Keine Druck-Jobs — erst „Jobs erzeugen".</p>;
  }

  return (
    <>
      {catalogError && (
        <div className="banner-err">flux-Katalog nicht erreichbar ({catalogError}).</div>
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

      {jobs.map((j) => (
        <JobRow key={j.id} orderId={orderId} job={j} products={products} fluxUrlTpl={fluxUrlTpl} />
      ))}

      <form action={action} className="toolbar" style={{ gap: 10, marginTop: 6 }}>
        <input type="hidden" name="id" value={orderId} />
        <button type="submit" disabled={pending} style={{ padding: "7px 14px" }}>
          {pending ? "…" : sentOrderId ? "erneut an flux senden" : "Auftrag an flux senden"}
        </button>
        {sentOrderId && <span className="count">gesendet · flux {sentOrderId} (Links „flux öffnen" je Bauteil oben)</span>}
        {state.ok && <span className="msg-ok">✓ {state.note}</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </form>

      {(lastPayload != null || lastResponse != null) && (
        <div style={{ marginTop: 8 }}>
          <div className="count">
            letzte Übergabe{lastSentAt ? ` · ${new Date(lastSentAt).toLocaleString("de-DE")}` : ""}
          </div>
          <Json label="→ gesendetes Payload" value={lastPayload} />
          <Json label="← Antwort von flux" value={lastResponse} />
        </div>
      )}
    </>
  );
}
