"use client";

import { useActionState, useMemo, useState } from "react";
import { saveTemplate, deleteTemplate, type State } from "./actions";

const empty: State = {};

export type Tpl = {
  id: string;
  name: string;
  flux_product: string;
  flux_product_id: string | null;
  signature: string | null;
  paper_type: string | null;
  paper_type_back: string | null;
  services: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  is_active: boolean;
  notiz: string | null;
};
type Svc = { id: string; name: string; defaultOptionId?: string; options: { id: string; name: string }[] };
type Product = { id: string; name: string; description?: string; services: Svc[] };

const F = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="field">
    <span>{label}</span>
    {children}
    {hint && <small className="count">{hint}</small>}
  </label>
);

const isPaperSvc = (n: string) => /papiersorte|papertype/i.test(n);

export function TemplateForm({
  tpl,
  products,
  paperTypes,
  signatures,
  catalogError,
}: {
  tpl?: Tpl;
  products: Product[];
  paperTypes: string[];
  signatures: string[];
  catalogError?: string;
}) {
  const [state, action, pending] = useActionState(saveTemplate, empty);
  const [dState, dAction] = useActionState(deleteTemplate, empty);
  const [product, setProduct] = useState(tpl?.flux_product ?? "");

  const selected = useMemo(() => products.find((p) => p.name === product), [products, product]);
  const svcDefaults = useMemo(() => {
    const o: Record<string, string> = {};
    for (const sv of selected?.services ?? []) {
      if (isPaperSvc(sv.name)) continue;
      const def = sv.options.find((x) => x.id === sv.defaultOptionId);
      if (def) o[sv.name] = def.name;
    }
    return o;
  }, [selected]);

  const servicesJson = tpl?.services && Object.keys(tpl.services).length
    ? JSON.stringify(tpl.services, null, 2)
    : JSON.stringify(svcDefaults, null, 2);

  return (
    <form action={action} className="rows" style={{ maxWidth: 640 }}>
      {tpl && <input type="hidden" name="id" value={tpl.id} />}
      <input type="hidden" name="flux_product_id" value={selected?.id ?? tpl?.flux_product_id ?? ""} />

      {catalogError && (
        <div className="banner-err">flux-Katalog nicht erreichbar ({catalogError}) — Felder als Freitext.</div>
      )}

      <F label="Name">
        <input name="name" defaultValue={tpl?.name ?? ""} required placeholder="Opri A5 Inhalt 4/4" />
      </F>

      <F label="flux-Produkt" hint={selected?.description}>
        <input
          name="flux_product"
          list="flux-products"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          required
          placeholder="Opri_A5_2-2_4/4"
        />
        <datalist id="flux-products">
          {products.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </F>

      <F label="Standbogen (optional)" hint="Drucker wird erst beim Batch gewählt">
        <input name="signature" defaultValue={tpl?.signature ?? ""} list="flux-signatures" />
        <datalist id="flux-signatures">
          {signatures.map((sg) => (
            <option key={sg} value={sg} />
          ))}
        </datalist>
      </F>

      <div className="row" style={{ border: "none", padding: 0 }}>
        <F label="Papiersorte Override" hint="leer = aus Materialkatalog">
          <input name="paper_type" defaultValue={tpl?.paper_type ?? ""} list="flux-papers" />
        </F>
        <F label="Papiersorte Rückseite" hint="leer = aus Materialkatalog">
          <input name="paper_type_back" defaultValue={tpl?.paper_type_back ?? ""} list="flux-papers" />
        </F>
        <datalist id="flux-papers">
          {paperTypes.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      <F
        label="Services (JSON: Service-Name → Options-Name)"
        hint={
          selected?.services?.length
            ? `verfügbar: ${selected.services.filter((sv) => !isPaperSvc(sv.name)).map((sv) => sv.name).join(", ")}`
            : undefined
        }
      >
        <textarea name="services" rows={5} defaultValue={servicesJson} style={{ font: "12px ui-monospace, monospace" }} />
      </F>

      {selected?.services?.filter((sv) => !isPaperSvc(sv.name)).length ? (
        <details>
          <summary className="count">Options-Werte je Service</summary>
          <ul className="count" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {selected.services
              .filter((sv) => !isPaperSvc(sv.name))
              .map((sv) => (
                <li key={sv.id}>
                  <strong>{sv.name}</strong>: {sv.options.map((o) => o.name).join(" · ") || "—"}
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      <details>
        <summary className="count">Extra-Felder (JSON, optional)</summary>
        <textarea
          name="extra"
          rows={3}
          defaultValue={tpl?.extra && Object.keys(tpl.extra).length ? JSON.stringify(tpl.extra, null, 2) : ""}
          style={{ font: "12px ui-monospace, monospace", marginTop: 6, width: "100%" }}
        />
      </details>

      <F label="Notiz">
        <input name="notiz" defaultValue={tpl?.notiz ?? ""} />
      </F>
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={tpl?.is_active ?? true} /> aktiv
      </label>

      <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
        <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
        {tpl && (
          <button
            type="submit"
            className="ghost"
            formAction={dAction}
            formNoValidate
            onClick={(e) => {
              if (!confirm("Template löschen?")) e.preventDefault();
            }}
          >
            Löschen
          </button>
        )}
        {state.error && <span className="msg-err">{state.error}</span>}
        {dState.error && <span className="msg-err">{dState.error}</span>}
      </div>
    </form>
  );
}
