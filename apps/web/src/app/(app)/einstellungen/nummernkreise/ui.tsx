"use client";

import { useActionState } from "react";
import { saveNumberSequence, type RowState } from "./actions";

export type NumberSequence = {
  key: string;
  prefix: string;
  suffix: string;
  padding: number;
  period: "none" | "year";
  period_value: string;
  current_value: number;
};

const LABELS: Record<string, string> = {
  quote: "Angebot",
  order: "Auftrag",
  invoice: "Rechnung",
  credit_note: "Gutschrift",
  delivery_note: "Lieferschein",
  dunning: "Mahnung",
  purchase_order: "Bestellung",
  customer_number: "Debitorennummer",
  supplier_number: "Kreditorennummer",
};

const empty: RowState = {};

function preview(prefix: string, period: string, padding: number, next: number) {
  const year = new Date().getFullYear();
  const num = String(next).padStart(Math.min(10, Math.max(1, padding || 1)), "0");
  return `${prefix}${period === "year" ? year + "-" : ""}${num}`;
}

function Row({ row }: { row: NumberSequence }) {
  const [state, action, pending] = useActionState(saveNumberSequence, empty);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="key" value={row.key} />
      <span className="w-name">
        <strong>{LABELS[row.key] ?? row.key}</strong>
        <span className="tag" style={{ marginLeft: 6 }}>{row.key}</span>
      </span>
      <input className="w-code" name="prefix" defaultValue={row.prefix} placeholder="Präfix" />
      <input className="w-code" name="suffix" defaultValue={row.suffix} placeholder="Suffix" />
      <label className="chk">
        Stellen
        <input
          name="padding"
          type="number"
          min={1}
          max={10}
          defaultValue={row.padding}
          style={{ width: 56 }}
        />
      </label>
      <select name="period" defaultValue={row.period}>
        <option value="year">Reset jährlich</option>
        <option value="none">kein Reset</option>
      </select>
      <span className="tag">
        Beispiel {preview(row.prefix, row.period, row.padding, row.current_value + 1)}
      </span>
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function NumberSequenceTable({ rows }: { rows: NumberSequence[] }) {
  return (
    <div className="rows">
      {rows.map((r) => (
        <Row key={r.key} row={r} />
      ))}
    </div>
  );
}
