"use client";

import { useActionState } from "react";
import { createMaterial, type State } from "./actions";

const empty: State = {};

export function NewMaterialForm({
  rollen,
  papierRolleId,
}: {
  rollen: { id: string; name: string }[];
  papierRolleId: string | null;
}) {
  const [state, action, pending] = useActionState(createMaterial, empty);

  return (
    <details style={{ marginBottom: 16 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Neues Papier erfassen</summary>
      <form action={action} className="row" style={{ border: "none", padding: "10px 0 0", flexWrap: "wrap", gap: 8 }}>
        <label className="field" style={{ minWidth: 180 }}>
          <span>Name</span>
          <input name="name" required placeholder="170g Bilderdruck matt" />
        </label>
        <label className="field" style={{ width: 120 }}>
          <span>Kurzname</span>
          <input name="name_kurz" placeholder="optional" />
        </label>
        <label className="field" style={{ width: 150 }}>
          <span>Rolle</span>
          <select name="rolle_id" defaultValue={papierRolleId ?? ""}>
            <option value="">—</option>
            {rollen.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ width: 90 }}>
          <span>Grammatur g</span>
          <input name="grammatur" inputMode="decimal" placeholder="170" />
        </label>
        <label className="field" style={{ width: 130 }}>
          <span>Sorte</span>
          <input name="sorte" placeholder="Bilderdruck" />
        </label>
        <label className="field" style={{ width: 110 }}>
          <span>Oberfläche</span>
          <select name="oberflaeche" defaultValue="">
            <option value="">—</option>
            <option value="matt">matt</option>
            <option value="glänzend">glänzend</option>
          </select>
        </label>
        <label className="field" style={{ width: 90 }}>
          <span>Dicke mm</span>
          <input name="dicke_mm" inputMode="decimal" placeholder="0,17" />
        </label>
        <label className="field" style={{ minWidth: 220 }}>
          <span>flux-Papiersorte</span>
          <input name="flux_paper_type" list="flux-papertypes" placeholder="optional" />
        </label>
        <div style={{ alignSelf: "flex-end" }}>
          <button type="submit" disabled={pending}>{pending ? "…" : "Anlegen"}</button>
        </div>
        {state.ok && <span className="msg-ok">✓ angelegt</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </form>
    </details>
  );
}
