"use client";

import { useActionState } from "react";
import { saveGruppe, saveStamm, type RowState } from "./actions";
import { FluxProductFields, type FluxProductOpt } from "@/lib/flux/FluxProductFields";

const empty: RowState = {};

export type Gruppe = {
  id: string;
  kuerzel: string;
  name: string;
  titel_kuerzel: string | null;
  flux_product: string | null;
  flux_services: Record<string, unknown> | null;
  druckverfahren: string | null;
};
export type Stamm = {
  id: string;
  gruppe_id: string | null;
  sku: string;
  name: string;
  flux_product: string | null;
  flux_services: Record<string, unknown> | null;
};

function GruppeRow({
  g,
  products,
  catalogError,
}: {
  g: Gruppe;
  products: FluxProductOpt[];
  catalogError?: string;
}) {
  const [state, action, pending] = useActionState(saveGruppe, empty);
  return (
    <form className="row" action={action} style={{ background: "var(--tag-bg)", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <input type="hidden" name="id" value={g.id} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="w-code" style={{ fontWeight: 600 }}>{g.kuerzel}</span>
        <span className="w-name" style={{ fontWeight: 600 }}>{g.name}</span>
        <input
          name="titel_kuerzel"
          defaultValue={g.titel_kuerzel ?? ""}
          placeholder="Titel-Kürzel"
          title="Abkürzung für den flux-Titel (z.B. WK)"
          style={{ width: 90 }}
        />
        <input
          name="druckverfahren"
          defaultValue={g.druckverfahren ?? ""}
          placeholder="Druckverfahren"
          style={{ width: 120 }}
        />
        <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
        {state.ok && <span className="msg-ok">✓</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingLeft: 4 }}>
        <FluxProductFields
          products={products}
          defaultProduct={g.flux_product}
          defaultServices={g.flux_services}
          catalogError={catalogError}
        />
      </div>
    </form>
  );
}

function StammRow({
  s,
  inheritedProduct,
  products,
}: {
  s: Stamm;
  inheritedProduct: string | null;
  products: FluxProductOpt[];
}) {
  const [state, action, pending] = useActionState(saveStamm, empty);
  const hasOverride = !!s.flux_product || !!(s.flux_services && Object.keys(s.flux_services).length);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="id" value={s.id} />
      <span className="w-code" style={{ color: "var(--muted)" }}>{s.sku}</span>
      <span className="w-name">{s.name}</span>
      <input
        name="flux_product"
        list="flux-products-catalog"
        defaultValue={s.flux_product ?? ""}
        placeholder={inheritedProduct ? `erbt: ${inheritedProduct}` : "eigenes flux-Produkt"}
        style={{ width: 180 }}
      />
      <details style={{ flex: "none" }} open={hasOverride && Object.keys(s.flux_services ?? {}).length > 0}>
        <summary className="count" style={{ cursor: "pointer" }}>Services</summary>
        <textarea
          name="flux_services_json"
          defaultValue={
            s.flux_services && Object.keys(s.flux_services).length
              ? JSON.stringify(s.flux_services, null, 2)
              : ""
          }
          placeholder='{ "Beidseitig": "Ja" }'
          rows={3}
          style={{ font: "12px ui-monospace, monospace", width: 220 }}
        />
      </details>
      <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function OpriProdukte({
  gruppen,
  stamm,
  products,
  catalogError,
}: {
  gruppen: Gruppe[];
  stamm: Stamm[];
  products: FluxProductOpt[];
  catalogError?: string;
}) {
  return (
    <div className="rows">
      {gruppen.map((g) => {
        const kids = stamm.filter((s) => s.gruppe_id === g.id);
        return (
          <div key={g.id} style={{ marginBottom: 14 }}>
            <GruppeRow g={g} products={products} catalogError={catalogError} />
            {kids.map((s) => (
              <StammRow key={s.id} s={s} inheritedProduct={g.flux_product} products={products} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
