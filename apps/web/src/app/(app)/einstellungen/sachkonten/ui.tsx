"use client";

import { useActionState } from "react";
import { saveLedgerAccount, type RowState } from "./actions";

export type LedgerAccount = {
  id: string;
  number: string;
  name: string;
  kind: string;
  is_system: boolean;
  is_active: boolean;
};

const KIND_LABELS: [string, string][] = [
  ["revenue", "Erlös"],
  ["expense", "Aufwand"],
  ["asset", "Aktiva"],
  ["liability", "Passiva"],
  ["other", "Sonstige"],
];

const empty: RowState = {};

function KindSelect({ value }: { value?: string }) {
  return (
    <select name="kind" defaultValue={value ?? "expense"}>
      {KIND_LABELS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Row({ row }: { row: LedgerAccount }) {
  const [state, action, pending] = useActionState(saveLedgerAccount, empty);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="id" value={row.id} />
      <input
        className="w-code"
        name="number"
        defaultValue={row.number}
        readOnly={row.is_system}
        required
      />
      <input className="w-name" name="name" defaultValue={row.name} required />
      <KindSelect value={row.kind} />
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={row.is_active} /> aktiv
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {row.is_system && <span className="tag">System</span>}
      {state.ok && <span className="msg-ok">✓ gespeichert</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

function NewRow() {
  const [state, action, pending] = useActionState(saveLedgerAccount, empty);
  return (
    <form className="row new" action={action}>
      <input className="w-code" name="number" placeholder="Konto-Nr" required />
      <input className="w-name" name="name" placeholder="Bezeichnung" required />
      <KindSelect />
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked /> aktiv
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Hinzufügen"}
      </button>
      {state.ok && <span className="msg-ok">✓ angelegt</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function LedgerAccountTable({ rows }: { rows: LedgerAccount[] }) {
  return (
    <div className="rows">
      <div className="row head">
        <span className="w-code">Nummer</span>
        <span className="w-name">Bezeichnung</span>
        <span>Art</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
      <NewRow />
    </div>
  );
}
