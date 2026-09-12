"use client";

import { useActionState, useState } from "react";
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
  catalogError,
}: {
  s: Stamm;
  inheritedProduct: string | null;
  products: FluxProductOpt[];
  catalogError?: string;
}) {
  const [state, action, pending] = useActionState(saveStamm, empty);
  const hasOverride = !!s.flux_product || !!(s.flux_services && Object.keys(s.flux_services).length);
  // Picker erst bei Bedarf mounten – bei bis zu 2000 Stammartikeln sonst zu schwer.
  const [expanded, setExpanded] = useState(hasOverride);

  return (
    <form className="row" action={action} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <input type="hidden" name="id" value={s.id} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="w-code" style={{ color: "var(--muted)" }}>{s.sku}</span>
        <span className="w-name">{s.name}</span>
        <button
          type="button"
          className="ghost"
          onClick={() => setExpanded((v) => !v)}
          style={{ padding: "3px 8px", fontSize: 12 }}
        >
          {expanded
            ? "flux ausblenden"
            : s.flux_product
              ? `flux: ${s.flux_product} ✎`
              : inheritedProduct
                ? `erbt: ${inheritedProduct} ✎`
                : "flux anpassen"}
        </button>
        {expanded && (
          <>
            <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
            {state.ok && <span className="msg-ok">✓</span>}
            {state.error && <span className="msg-err">{state.error}</span>}
          </>
        )}
      </div>
      {expanded && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingLeft: 4 }}>
          <FluxProductFields
            products={products}
            defaultProduct={s.flux_product}
            defaultServices={s.flux_services}
            catalogError={catalogError}
          />
        </div>
      )}
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
              <StammRow
                key={s.id}
                s={s}
                inheritedProduct={g.flux_product}
                products={products}
                catalogError={catalogError}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
