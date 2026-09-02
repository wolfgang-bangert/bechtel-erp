"use client";

import { useActionState } from "react";
import { savePackmittel, deletePackmittel, type RowState } from "./actions";

export type Packmittel = {
  id: string;
  bezeichnung: string;
  kategorie: string | null;
  laenge_mm: number | null;
  breite_mm: number | null;
  hoehe_mm: number | null;
  leergewicht_kg: number;
  max_fuellgewicht_kg: number | null;
  material: string | null;
  is_active: boolean;
};

const empty: RowState = {};

function Row({ row }: { row?: Packmittel }) {
  const [state, action, pending] = useActionState(savePackmittel, empty);
  const [dState, dAction, dPending] = useActionState(deletePackmittel, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={action}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input className="w-name" name="bezeichnung" defaultValue={row?.bezeichnung ?? ""} placeholder="Bezeichnung" required />
      <input name="kategorie" defaultValue={row?.kategorie ?? ""} placeholder="Kategorie" style={{ width: 100 }} />
      <input name="laenge_mm" defaultValue={row?.laenge_mm ?? ""} placeholder="L mm" style={{ width: 64 }} inputMode="numeric" />
      <input name="breite_mm" defaultValue={row?.breite_mm ?? ""} placeholder="B mm" style={{ width: 64 }} inputMode="numeric" />
      <input name="hoehe_mm" defaultValue={row?.hoehe_mm ?? ""} placeholder="H mm" style={{ width: 64 }} inputMode="numeric" />
      <input name="leergewicht_kg" defaultValue={row?.leergewicht_kg ?? ""} placeholder="Tara" style={{ width: 60 }} inputMode="decimal" />
      <input name="max_fuellgewicht_kg" defaultValue={row?.max_fuellgewicht_kg ?? ""} placeholder="max kg" style={{ width: 64 }} inputMode="decimal" />
      <input name="material" defaultValue={row?.material ?? ""} placeholder="Material" style={{ width: 80 }} />
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
            if (!confirm("Kartonage löschen?")) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
    </form>
  );
}

export function PackmittelTable({ rows }: { rows: Packmittel[] }) {
  return (
    <div className="rows" style={{ maxWidth: 1000 }}>
      <div className="row head">
        <span className="w-name">Bezeichnung</span>
        <span style={{ width: 100 }}>Kategorie</span>
        <span style={{ width: 200 }}>L / B / H (mm)</span>
        <span style={{ width: 60 }}>Tara</span>
        <span style={{ width: 64 }}>max kg</span>
        <span style={{ width: 80 }}>Material</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
      <Row />
    </div>
  );
}
