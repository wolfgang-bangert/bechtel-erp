"use client";

import { useActionState, useState } from "react";
import { matchTransaction, type MatchState } from "./actions";

const empty: MatchState = {};

export type Candidate = { number: string; label: string };

export function MatchForm({
  txId,
  candidates,
  side = "debitor",
}: {
  txId: string;
  candidates: Candidate[];
  side?: "debitor" | "kreditor";
}) {
  const [state, action, pending] = useActionState(matchTransaction, empty);
  const [manual, setManual] = useState(candidates.length === 0);
  const noun = side === "kreditor" ? "Eingangsrechnung" : "Rechnung";

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="side" value={side} />

      {!manual && (
        <select name="invoice_number" defaultValue="" style={{ maxWidth: 340 }}>
          <option value="">– {noun} wählen ({candidates.length}) –</option>
          {candidates.map((c) => (
            <option key={c.number} value={c.number}>
              {c.label}
            </option>
          ))}
        </select>
      )}

      {manual && (
        <input
          name="invoice_number_manual"
          placeholder={side === "kreditor" ? "ER-Nr." : "Rechnungs-Nr."}
          style={{ width: 140 }}
        />
      )}

      <button type="submit" disabled={pending}>
        {pending ? "…" : "zuordnen"}
      </button>

      {candidates.length > 0 && (
        <button
          type="button"
          className="ghost"
          style={{ padding: "4px 8px" }}
          onClick={() => setManual((m) => !m)}
        >
          {manual ? "Liste" : "Nr. eintippen"}
        </button>
      )}

      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
