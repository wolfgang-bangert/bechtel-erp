"use client";

import { useMemo, useState } from "react";

export type FluxSvc = {
  id: string;
  name: string;
  defaultOptionId?: string;
  options: { id: string; name: string }[];
};
export type FluxProductOpt = { id: string; name: string; description?: string; services: FluxSvc[] };

/**
 * flux-Produkt + Service-Overrides als Formularfelder (kein eigenes <form>) –
 * für Produktgruppe/Stammartikel/Materialregel gleichermaßen. Erzeugt
 * `flux_product`, `svc_keys` (versteckt) und je Service `svc__<Name>`; die
 * Server Action liest sie wie in job-/template-Formularen üblich aus.
 */
export function FluxProductFields({
  products,
  defaultProduct,
  defaultServices,
  catalogError,
}: {
  products: FluxProductOpt[];
  defaultProduct?: string | null;
  defaultServices?: Record<string, unknown> | null;
  catalogError?: string;
}) {
  const [product, setProduct] = useState(defaultProduct ?? "");
  const selected = useMemo(() => products.find((p) => p.name === product), [products, product]);

  // Services nach Name gruppiert (flux liefert manche mehrfach mit je einer Option).
  const svcGroups = useMemo(() => {
    const m = new Map<string, { options: string[]; def?: string }>();
    for (const sv of selected?.services ?? []) {
      const g = m.get(sv.name) ?? { options: [] as string[], def: undefined as string | undefined };
      for (const o of sv.options) if (o.name && !g.options.includes(o.name)) g.options.push(o.name);
      const def = sv.options.find((x) => x.id === sv.defaultOptionId);
      if (def && !g.def) g.def = def.name;
      m.set(sv.name, g);
    }
    return [...m.entries()].map(([name, g]) => ({ name, ...g }));
  }, [selected]);
  const svcKeys = svcGroups.map((g) => g.name);
  const produktFehlt = product.trim().length > 0 && products.length > 0 && !selected;

  // Overrides, die zu keinem Service des aktuell gewählten Produkts (mehr) passen.
  const svcExtra = Object.entries(defaultServices ?? {}).filter(([k]) => !svcKeys.includes(k));

  return (
    <>
      {catalogError && (
        <div className="banner-err">flux-Katalog nicht erreichbar ({catalogError}) — Produktname als Freitext.</div>
      )}
      <label className="field" style={{ minWidth: 320 }}>
        <span>flux-Produkt</span>
        <input
          name="flux_product"
          list="flux-products-catalog"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="Opri_A5_2-2_4/4"
          style={{ width: "100%", minWidth: 320 }}
        />
        {selected?.description && <small className="count">{selected.description}</small>}
      </label>
      <datalist id="flux-products-catalog">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {produktFehlt && (
        <div className="msg-err" style={{ fontSize: 13 }}>
          „{product}" ist nicht im flux-Katalog – Service-Auswahl nicht verfügbar.
        </div>
      )}

      <input type="hidden" name="svc_keys" value={JSON.stringify(svcKeys)} />
      {svcGroups.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
          {svcGroups.map((g) => {
            const cur = (defaultServices?.[g.name] as string) ?? "";
            return (
              <label className="field" key={`${product}|${g.name}`}>
                <span>{g.name}</span>
                <select name={`svc__${g.name}`} defaultValue={cur}>
                  <option value="">{g.def ? `(Standard: ${g.def})` : "(Standard)"}</option>
                  {g.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {cur && !g.options.includes(cur) && (
                    <option value={cur}>{cur} (nicht mehr im Produkt)</option>
                  )}
                </select>
              </label>
            );
          })}
        </div>
      )}

      {svcExtra.length > 0 && (
        <div className="count" style={{ marginTop: 4 }}>
          weitere gespeicherte Overrides (nicht im gewählten Produkt):{" "}
          {svcExtra.map(([k, v]) => `${k}=${String(v)}`).join(", ")}
        </div>
      )}
    </>
  );
}
