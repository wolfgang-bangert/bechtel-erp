"use client";

import { useActionState } from "react";
import { resolveOrderAction, type State } from "../actions";

const empty: State = {};

export function ResolveButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resolveOrderAction, empty);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "neu auflösen"}
      </button>
      {state.ok && <span className="msg-ok">✓ {state.note}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
