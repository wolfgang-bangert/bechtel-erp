"use client";

import { useActionState } from "react";
import { saveCostCenter, type RowState } from "./actions";

export type CostCenter = {
  id: string;
  number: string;
  name: string;
  is_active: boolean;
};

const empty: RowState = {};

function Row({ row }: { row: CostCenter }) {
  const [state, action, pending] = useActionState(saveCostCenter, empty);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="id" value={row.id} />
      <input className="w-code" name="number" defaultValue={row.number} required />
      <input className="w-name" name="name" defaultValue={row.name} required />
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={row.is_active} /> aktiv
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

function NewRow() {
  const [state, action, pending] = useActionState(saveCostCenter, empty);
  return (
    <form className="row new" action={action}>
      <input className="w-code" name="number" placeholder="Nummer" required />
      <input className="w-name" name="name" placeholder="Bezeichnung" required />
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

export function CostCenterTable({ rows }: { rows: CostCenter[] }) {
  return (
    <div className="rows">
      <div className="row head">
        <span className="w-code">Nummer</span>
        <span className="w-name">Bezeichnung</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
      <NewRow />
    </div>
  );
}
