"use client";

import { useActionState } from "react";
import { matchTransaction, type MatchState } from "./actions";

const empty: MatchState = {};

export function MatchForm({ txId }: { txId: string }) {
  const [state, action, pending] = useActionState(matchTransaction, empty);
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <input
        name="invoice_number"
        placeholder="Rechnungs-Nr."
        style={{ width: 130 }}
        required
      />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "zuordnen"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
