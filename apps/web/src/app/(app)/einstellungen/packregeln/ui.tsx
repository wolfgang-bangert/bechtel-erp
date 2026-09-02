"use client";

import { useActionState } from "react";
import { savePackregel, deletePackregel, type RowState } from "./actions";

export type Packregel = {
  id: string;
  produkt_tag: string | null;
  stueck_von: number;
  stueck_bis: number;
  packmittel_id: string | null;
  spedition_erlaubt: boolean;
  prio: number;
  is_active: boolean;
};

const empty: RowState = {};

function Row({
  row,
  packmittel,
}: {
  row?: Packregel;
  packmittel: { id: string; bezeichnung: string }[];
}) {
  const [state, action, pending] = useActionState(savePackregel, empty);
  const [dState, dAction, dPending] = useActionState(deletePackregel, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={action}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input
        name="produkt_tag"
        defaultValue={row?.produkt_tag ?? ""}
        placeholder="Produkt-Tag (Freitext, leer = alle)"
        style={{ width: 220 }}
      />
      <input name="stueck_von" defaultValue={row?.stueck_von ?? 0} placeholder="von" style={{ width: 56 }} inputMode="numeric" />
      <input name="stueck_bis" defaultValue={row?.stueck_bis ?? ""} placeholder="bis" style={{ width: 56 }} inputMode="numeric" required />
      <select name="packmittel_id" defaultValue={row?.packmittel_id ?? ""} style={{ width: 170 }}>
        <option value="">– kein Karton –</option>
        {packmittel.map((p) => (
          <option key={p.id} value={p.id}>
            {p.bezeichnung}
          </option>
        ))}
      </select>
      <label className="chk">
        <input type="checkbox" name="spedition_erlaubt" defaultChecked={row?.spedition_erlaubt ?? true} /> Spedition
      </label>
      <input name="prio" defaultValue={row?.prio ?? 100} placeholder="Prio" style={{ width: 52 }} inputMode="numeric" />
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={row?.is_active ?? true} /> aktiv
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "…" : isNew ? "Hinzufügen" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
      {row && (
        <button
          type="submit"
          className="ghost"
          formAction={dAction}
          formNoValidate
          disabled={dPending}
          onClick={(e) => {
            if (!confirm("Regel löschen?")) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
    </form>
  );
}

export function PackregelTable({
  rows,
  packmittel,
}: {
  rows: Packregel[];
  packmittel: { id: string; bezeichnung: string }[];
}) {
  return (
    <div className="rows" style={{ maxWidth: 1000 }}>
      <div className="row head">
        <span style={{ width: 220 }}>Produkt-Tag</span>
        <span style={{ width: 56 }}>von</span>
        <span style={{ width: 56 }}>bis</span>
        <span style={{ width: 170 }}>Kartonage</span>
        <span style={{ width: 90 }}>Spedition</span>
        <span style={{ width: 52 }}>Prio</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} packmittel={packmittel} />
      ))}
      <Row packmittel={packmittel} />
    </div>
  );
}
