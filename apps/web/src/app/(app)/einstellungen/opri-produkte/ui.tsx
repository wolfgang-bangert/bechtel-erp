"use client";

import { useActionState } from "react";
import { saveGruppe, saveStamm, type RowState } from "./actions";

const empty: RowState = {};

export type Gruppe = {
  id: string;
  kuerzel: string;
  name: string;
  flux_template: string | null;
  druckverfahren: string | null;
};
export type Stamm = {
  id: string;
  gruppe_id: string | null;
  sku: string;
  name: string;
  flux_template: string | null;
};

function GruppeRow({ g }: { g: Gruppe }) {
  const [state, action, pending] = useActionState(saveGruppe, empty);
  return (
    <form className="row" action={action} style={{ background: "var(--tag-bg)" }}>
      <input type="hidden" name="id" value={g.id} />
      <span className="w-code" style={{ fontWeight: 600 }}>{g.kuerzel}</span>
      <span className="w-name" style={{ fontWeight: 600 }}>{g.name}</span>
      <input
        name="flux_template"
        defaultValue={g.flux_template ?? ""}
        placeholder="flux_template (Default)"
        style={{ width: 200 }}
      />
      <input
        name="druckverfahren"
        defaultValue={g.druckverfahren ?? ""}
        placeholder="Druckverfahren"
        style={{ width: 130 }}
      />
      <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

function StammRow({ s, inherited }: { s: Stamm; inherited: string | null }) {
  const [state, action, pending] = useActionState(saveStamm, empty);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="id" value={s.id} />
      <span className="w-code" style={{ color: "var(--muted)" }}>{s.sku}</span>
      <span className="w-name">{s.name}</span>
      <input
        name="flux_template"
        defaultValue={s.flux_template ?? ""}
        placeholder={inherited ? `erbt: ${inherited}` : "flux_template"}
        style={{ width: 200 }}
      />
      <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function OpriProdukte({ gruppen, stamm }: { gruppen: Gruppe[]; stamm: Stamm[] }) {
  return (
    <div className="rows">
      {gruppen.map((g) => {
        const kids = stamm.filter((s) => s.gruppe_id === g.id);
        return (
          <div key={g.id} style={{ marginBottom: 14 }}>
            <GruppeRow g={g} />
            {kids.map((s) => (
              <StammRow key={s.id} s={s} inherited={g.flux_template} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
