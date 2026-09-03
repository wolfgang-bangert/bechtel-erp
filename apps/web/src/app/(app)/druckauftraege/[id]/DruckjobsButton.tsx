"use client";

import { useActionState } from "react";
import { druckjobsAction, type State } from "../actions";

const empty: State = {};

export function DruckjobsButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(druckjobsAction, empty);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Druckjobs erzeugen"}
      </button>
      {state.ok && <span className="msg-ok">✓ {state.note}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
