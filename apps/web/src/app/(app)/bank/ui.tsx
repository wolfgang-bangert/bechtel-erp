"use client";

import { useActionState } from "react";
import { matchTransaction, type MatchState } from "./actions";

const empty: MatchState = {};

export type Candidate = { number: string; label: string };

/** Eine <datalist> je Seite, von allen Zeilen per id genutzt. Wird nie geclippt. */
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
  defaultValue,
  hint,
  showAmount = false,
  remaining,
}: {
  txId: string;
  listId: string;
  side?: "debitor" | "kreditor";
  defaultValue?: string;
  hint?: string;
  showAmount?: boolean;
  remaining?: number;
}) {
  const [state, action, pending] = useActionState(matchTransaction, empty);

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="side" value={side} />
      <input
        name="invoice_number_manual"
        list={listId}
        defaultValue={defaultValue}
        autoComplete="off"
        placeholder={hint ?? (side === "kreditor" ? "ER-Nr. / Lieferant …" : "Rg-Nr. / Kunde …")}
        style={{ width: 250, ...(defaultValue ? { borderColor: "#3a7" } : {}) }}
      />
      {showAmount && (
        <input
          name="alloc_amount"
          inputMode="decimal"
          placeholder={remaining != null ? `Betrag (Rest ${remaining.toFixed(2)})` : "Betrag"}
          style={{ width: 140 }}
        />
      )}
      <button type="submit" disabled={pending}>
        {pending ? "…" : "zuordnen"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
