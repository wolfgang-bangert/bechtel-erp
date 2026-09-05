"use client";

import { useActionState } from "react";
import { festschreibenAction, type State } from "../actions";

const empty: State = {};

export function FestschreibenButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(festschreibenAction, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Abrechnung festschreiben? Danach keine Änderungen mehr.")) e.preventDefault();
        }}
      >
        {pending ? "…" : "Festschreiben"}
      </button>
      {state.ok && <span className="msg-ok"> ✓ {state.note}</span>}
      {state.error && <span className="msg-err"> {state.error}</span>}
    </form>
  );
}
