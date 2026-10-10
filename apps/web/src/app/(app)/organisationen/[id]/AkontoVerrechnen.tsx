"use client";

import { useActionState } from "react";
import { akontoVerrechnenAction, type AkontoState } from "./actions";

const empty: AkontoState = {};

export function AkontoVerrechnen({ id, summe, offen }: { id: string; summe: string; offen: string }) {
  const [state, action, pending] = useActionState(akontoVerrechnenAction, empty);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Akonto ${summe} mit den ältesten offenen Rechnungen (${offen}) verrechnen?`)) e.preventDefault();
      }}
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending}>
        {pending ? "Verrechne …" : "Akonto mit ältesten offenen Rechnungen verrechnen"}
      </button>
      {state.ok && <span className="msg-ok">{state.ok}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
