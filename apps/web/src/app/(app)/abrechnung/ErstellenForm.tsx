"use client";

import { useActionState } from "react";
import { erstellenAction, type State } from "./actions";

const empty: State = {};

export function ErstellenForm({ jahr, kw }: { jahr: number; kw: number }) {
  const [state, action, pending] = useActionState(erstellenAction, empty);
  return (
    <form action={action} className="toolbar" style={{ gap: 8, alignItems: "flex-end" }}>
      <label className="field" style={{ width: 90 }}>
        <span>Jahr</span>
        <input name="jahr" defaultValue={jahr} inputMode="numeric" />
      </label>
      <label className="field" style={{ width: 70 }}>
        <span>KW</span>
        <input name="kw" defaultValue={kw} inputMode="numeric" />
      </label>
      <button type="submit" disabled={pending}>{pending ? "…" : "Abrechnung erstellen / ergänzen"}</button>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
