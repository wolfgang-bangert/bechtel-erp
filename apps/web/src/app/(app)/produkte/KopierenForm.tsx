"use client";

import { useActionState } from "react";
import { kopiereProdukt, type RowState } from "./actions";

const empty: RowState = {};

export function KopierenForm({ produkte }: { produkte: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(kopiereProdukt, empty);
  if (produkte.length === 0) return null;
  return (
    <form className="row new" action={action}>
      <span className="count">Neue Sprachversion aus Vorlage:</span>
      <select name="vorlage_id" defaultValue={produkte[0].id} style={{ width: 240 }}>
        {produkte.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input name="name" placeholder="Name, z.B. IMPULS-VKHB spanisch" className="w-name" required />
      <input name="sprache" placeholder="Sprache (es)" style={{ width: 90 }} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Kopieren"}
      </button>
      {state.ok && <span className="msg-ok">✓ angelegt</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
