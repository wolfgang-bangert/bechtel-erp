"use client";

import { useActionState } from "react";
import { tauschUmschlagInhaltAction, type State } from "../actions";

const empty: State = {};

/**
 * Zeigt sich nur bei Aufträgen mit Umschlag/Inhalt-Trennung (z. B. PBS
 * "4-farbig"). Meistens ist Seite 1 = Umschlag, Seite 2 = Inhalt (~90 % der
 * Fälle) - bei den übrigen hilft dieser Button, es manuell umzudrehen.
 */
export function TauschUmschlagInhaltButton({ id, getauscht }: { id: string; getauscht: boolean }) {
  const [state, action, pending] = useActionState(tauschUmschlagInhaltAction, empty);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : getauscht ? "Seite 1/2 zurücktauschen" : "Seite 1 ↔ 2 tauschen (Umschlag/Inhalt)"}
      </button>
      {state.ok && <span className="msg-ok">✓ {state.note}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
