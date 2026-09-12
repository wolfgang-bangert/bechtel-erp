"use client";

import { useActionState } from "react";
import { refreshFluxCatalogAction, type State } from "./refreshAction";

const empty: State = {};

/** Holt den flux-Katalog (Produkte/Papier/Drucker/Standbögen) jetzt frisch –
 *  für neu in flux angelegte Dinge, ohne auf den 5-Minuten-Cache zu warten
 *  oder den Server neu zu starten. */
export function FluxRefreshButton() {
  const [state, action, pending] = useActionState(refreshFluxCatalogAction, empty);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button type="submit" className="ghost" disabled={pending} style={{ padding: "4px 10px" }}>
        {pending ? "…" : "🔄 flux-Katalog aktualisieren"}
      </button>
      {state.ok && <span className="msg-ok">✓ aktuell</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
