"use client";

import { useActionState } from "react";
import { saveMaschine, type RowState } from "./actions";

export type Maschine = {
  id: string;
  name: string;
  typ: string;
  flux_printer_name: string | null;
  farbe: string | null;
  kapazitaet_bogen_h: number | null;
  sortierung: number;
  aktiv: boolean;
};

const empty: RowState = {};
const TYP_LABEL: Record<string, string> = {
  druck: "Drucken",
  cello: "Cellophanieren",
  binden: "Binden",
  konfektion: "Konfektion",
  sonstige: "Sonstige",
};

function Fields({ row }: { row?: Maschine }) {
  return (
    <>
      <input
        name="name"
        defaultValue={row?.name}
        placeholder="Name"
        required
        style={{ minWidth: 180 }}
      />
      <select name="typ" defaultValue={row?.typ ?? "druck"}>
        {Object.entries(TYP_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <input
        name="flux_printer_name"
        defaultValue={row?.flux_printer_name ?? ""}
        placeholder="flux-Drucker (optional)"
        style={{ minWidth: 160 }}
      />
      <input
        type="color"
        name="farbe"
        defaultValue={row?.farbe ?? "#2f6feb"}
        title="Board-Farbe"
        style={{ width: 44, padding: 2 }}
      />
      <input
        name="kapazitaet_bogen_h"
        type="number"
        defaultValue={row?.kapazitaet_bogen_h ?? ""}
        placeholder="Bogen/h"
        style={{ width: 90 }}
      />
      <input
        name="sortierung"
        type="number"
        defaultValue={row?.sortierung ?? 100}
        title="Reihenfolge"
        style={{ width: 64 }}
      />
      <label className="chk">
        <input type="checkbox" name="aktiv" defaultChecked={row?.aktiv ?? true} /> aktiv
      </label>
    </>
  );
}

function Row({ row }: { row: Maschine }) {
  const [state, action, pending] = useActionState(saveMaschine, empty);
  return (
    <form className="row" action={action} style={{ flexWrap: "wrap", gap: 8 }}>
      <input type="hidden" name="id" value={row.id} />
      <Fields row={row} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

function NewRow() {
  const [state, action, pending] = useActionState(saveMaschine, empty);
  return (
    <form className="row new" action={action} style={{ flexWrap: "wrap", gap: 8 }}>
      <Fields />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Hinzufügen"}
      </button>
      {state.ok && <span className="msg-ok">✓ angelegt</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function MaschinenTable({ rows }: { rows: Maschine[] }) {
  return (
    <div className="rows">
      <div className="row head" style={{ gap: 8 }}>
        <span style={{ minWidth: 180 }}>Name</span>
        <span>Typ</span>
        <span style={{ minWidth: 160 }}>flux-Drucker</span>
        <span>Farbe</span>
        <span style={{ width: 90 }}>Bogen/h</span>
        <span style={{ width: 64 }}>Sort.</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
      <NewRow />
    </div>
  );
}
