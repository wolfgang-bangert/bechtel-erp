"use client";

import { useActionState } from "react";
import { personAnlegen, type State } from "../actions";

const empty: State = {};

export function NeuForm() {
  const [state, action, pending] = useActionState(personAnlegen, empty);
  return (
    <form action={action} className="toolbar" style={{ flexWrap: "wrap" }}>
      <input name="vorname" placeholder="Vorname" autoFocus />
      <input name="nachname" placeholder="Nachname" required />
      <button type="submit" disabled={pending}>
        Anlegen
      </button>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
