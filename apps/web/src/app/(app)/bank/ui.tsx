"use client";

import { useActionState } from "react";
import { matchTransaction, type MatchState } from "./actions";

const empty: MatchState = {};

export type Candidate = { number: string; label: string };

/** Eine gemeinsame Datalist pro Seite, von allen Zeilen genutzt. */
export function InvoiceDatalist({ id, options }: { id: string; options: Candidate[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o.number} value={o.label} />
      ))}
    </datalist>
  );
}

export function MatchForm({
  txId,
  listId,
  side = "debitor",
  hint,
  defaultValue,
}: {
  txId: string;
  listId: string;
  side?: "debitor" | "kreditor";
  hint?: string;
  defaultValue?: string;
}) {
  const [state, action, pending] = useActionState(matchTransaction, empty);

  return (
    <form
      action={action}
      style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
    >
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="side" value={side} />
      <input
        name="invoice_number_manual"
        list={listId}
        autoComplete="off"
        defaultValue={defaultValue}
        placeholder={hint ?? (side === "kreditor" ? "ER-Nr. / Lieferant …" : "Rg-Nr. / Kunde …")}
        style={{ width: 300, ...(defaultValue ? { borderColor: "var(--ok, #3a7)" } : {}) }}
      />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "zuordnen"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
