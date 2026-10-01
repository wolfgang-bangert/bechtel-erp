"use client";

import { useActionState } from "react";
import { rechnungAbschliessenAction, type State } from "./actions";

const empty: State = {};

export function AbschliessenButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(rechnungAbschliessenAction, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Rechnung abschließen? Vergibt die Rechnungsnummer, danach keine Änderungen mehr."))
            e.preventDefault();
        }}
      >
        {pending ? "…" : "Rechnung abschließen"}
      </button>
      {state.ok && <span className="msg-ok"> ✓ {state.note}</span>}
      {state.error && <span className="msg-err"> {state.error}</span>}
    </form>
  );
}
