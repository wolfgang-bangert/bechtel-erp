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

  // Nicht-Papier-Services des gewählten Produkts, nach Name gruppiert (flux
  // liefert manche Services mehrfach mit je einer Option → Optionen mergen).
  const svcGroups = useMemo(() => {
    const m = new Map<string, { options: string[]; def?: string }>();
    for (const sv of selected?.services ?? []) {
      if (isPaperSvc(sv.name)) continue;
      const g = m.get(sv.name) ?? { options: [] as string[], def: undefined as string | undefined };
      for (const o of sv.options) if (o.name && !g.options.includes(o.name)) g.options.push(o.name);
      const def = sv.options.find((x) => x.id === sv.defaultOptionId);
      if (def && !g.def) g.def = def.name;
      m.set(sv.name, g);
    }
    return [...m.entries()].map(([name, g]) => ({ name, ...g }));
  }, [selected]);
  const svcKeys = svcGroups.map((g) => g.name);

  // tpl.services-Einträge ohne passenden Service-Dropdown → JSON-Fallback
  const svcExtra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tpl?.services ?? {})) {
    if (!svcKeys.includes(k)) svcExtra[k] = v;
  }
  const servicesJsonDefault =
    svcGroups.length > 0
      ? Object.keys(svcExtra).length
        ? JSON.stringify(svcExtra, null, 2)
        : ""
      : tpl?.services && Object.keys(tpl.services).length
        ? JSON.stringify(tpl.services, null, 2)
        : "";

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

      {svcGroups.length > 0 && (
        <>
          <input type="hidden" name="svc_keys" value={JSON.stringify(svcKeys)} />
          <div className="count" style={{ marginTop: 4 }}>
            Service-Overrides — leer = flux-Standard des Produkts
          </div>
          <div className="row" style={{ border: "none", padding: 0, flexWrap: "wrap", gap: 12 }}>
            {svcGroups.map((g) => {
              const cur = (tpl?.services?.[g.name] as string) ?? "";
              return (
                <F key={`${product}|${g.name}`} label={g.name} hint={g.def ? `Standard: ${g.def}` : undefined}>
                  <select name={`svc__${g.name}`} defaultValue={cur}>
                    <option value="">(Standard)</option>
                    {g.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                    {cur && !g.options.includes(cur) && (
                      <option value={cur}>{cur} (nicht mehr im Produkt)</option>
                    )}
                  </select>
                </F>
              );
            })}
          </div>
        </>
      )}

      <details {...(Object.keys(svcExtra).length ? { open: true } : {})}>
        <summary className="count">
          {svcGroups.length ? "Weitere Services als JSON" : "Services als JSON"}
        </summary>
        <textarea
          name="services_json"
          rows={4}
          defaultValue={servicesJsonDefault}
          placeholder='{ "Service-Name": "Options-Name" }'
          style={{ font: "12px ui-monospace, monospace", marginTop: 6, width: "100%" }}
        />
      </details>

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
