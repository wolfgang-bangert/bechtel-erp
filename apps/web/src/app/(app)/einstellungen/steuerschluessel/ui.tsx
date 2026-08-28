"use client";

import { useActionState } from "react";
import { saveTaxCode, type RowState } from "./actions";

export type TaxCode = {
  id: string;
  code: string;
  name: string;
  rate: number;
  treatment: string;
  direction: string;
  datev_tax_key: string | null;
  is_system: boolean;
  is_active: boolean;
};

const TREATMENTS: [string, string][] = [
  ["standard_de", "Inland (19/7 %)"],
  ["reverse_charge_eu", "EU Reverse-Charge"],
  ["intra_community_supply", "innergem. Lieferung"],
  ["export_third_country", "Ausfuhr Drittland"],
  ["tax_free_other", "sonst. steuerfrei"],
];
const DIRECTIONS: [string, string][] = [
  ["output", "Erlös (USt)"],
  ["input", "Vorsteuer"],
];

const empty: RowState = {};

function Selects({ treatment, direction }: { treatment?: string; direction?: string }) {
  return (
    <>
      <select name="treatment" defaultValue={treatment ?? "standard_de"}>
        {TREATMENTS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select name="direction" defaultValue={direction ?? "output"}>
        {DIRECTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </>
  );
}

function Row({ row }: { row: TaxCode }) {
  const [state, action, pending] = useActionState(saveTaxCode, empty);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="id" value={row.id} />
      <input
        className="w-code"
        name="code"
        defaultValue={row.code}
        readOnly={row.is_system}
        required
      />
      <input className="w-name" name="name" defaultValue={row.name} required />
      <input
        className="w-rate"
        name="rate"
        type="number"
        step="0.001"
        min="0"
        max="100"
        defaultValue={row.rate}
      />
      <Selects treatment={row.treatment} direction={row.direction} />
      <input
        className="w-code"
        name="datev_tax_key"
        defaultValue={row.datev_tax_key ?? ""}
        placeholder="BU"
      />
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={row.is_active} /> aktiv
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {row.is_system && <span className="tag">System</span>}
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

function NewRow() {
  const [state, action, pending] = useActionState(saveTaxCode, empty);
  return (
    <form className="row new" action={action}>
      <input className="w-code" name="code" placeholder="Kürzel" required />
      <input className="w-name" name="name" placeholder="Bezeichnung" required />
      <input
        className="w-rate"
        name="rate"
        type="number"
        step="0.001"
        min="0"
        max="100"
        defaultValue="0"
      />
      <Selects />
      <input className="w-code" name="datev_tax_key" placeholder="BU" />
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

export function TaxCodeTable({ rows }: { rows: TaxCode[] }) {
  return (
    <div className="rows">
      <div className="row head">
        <span className="w-code">Kürzel</span>
        <span className="w-name">Bezeichnung</span>
        <span className="w-rate">Satz %</span>
        <span>Behandlung</span>
        <span>Richtung</span>
        <span className="w-code">BU-Schl.</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
      <NewRow />
    </div>
  );
}
