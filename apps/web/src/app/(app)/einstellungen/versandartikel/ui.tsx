"use client";

import { useActionState } from "react";
import { saveArtikel, deleteArtikel, type RowState } from "./actions";

export type Artikel = {
  id: string;
  bezeichnung: string;
  einheit: string;
  gewicht_kg: number;
  ean: string | null;
  is_active: boolean;
};

const empty: RowState = {};

function Row({ row }: { row?: Artikel }) {
  const [state, action, pending] = useActionState(saveArtikel, empty);
  const [dState, dAction, dPending] = useActionState(deleteArtikel, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={action}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input
        className="w-name"
        name="bezeichnung"
        defaultValue={row?.bezeichnung ?? ""}
        placeholder="Bezeichnung"
        required
      />
      <input name="einheit" defaultValue={row?.einheit ?? "Stk"} style={{ width: 70 }} />
      <input
        name="gewicht_kg"
        defaultValue={row?.gewicht_kg ?? ""}
        placeholder="kg/Einheit"
        style={{ width: 90 }}
        inputMode="decimal"
      />
      <input name="ean" defaultValue={row?.ean ?? ""} placeholder="EAN" style={{ width: 130 }} />
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
            if (!confirm("Artikel löschen?")) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
    </form>
  );
}

export function ArtikelTable({ rows }: { rows: Artikel[] }) {
  return (
    <div className="rows">
      <div className="row head">
        <span className="w-name">Bezeichnung</span>
        <span style={{ width: 70 }}>Einheit</span>
        <span style={{ width: 90 }}>kg/Einheit</span>
        <span style={{ width: 130 }}>EAN</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
      <Row />
    </div>
  );
}
