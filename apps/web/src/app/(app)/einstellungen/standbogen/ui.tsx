"use client";

import { useActionState } from "react";
import { deleteStandbogen, saveStandbogen, type RowState } from "./actions";

export type Standbogen = {
  id: string;
  bezeichnung: string | null;
  format: string;
  ausrichtung: "Hochformat" | "Querformat" | null;
  flux_signature: string;
  druckbogen: string | null;
  nutzen: number | null;
  notiz: string | null;
  aktiv: boolean;
  sortierung: number;
};

const empty: RowState = {};

function Fields({
  row,
  formate,
  signaturen,
  boegen,
}: {
  row?: Standbogen;
  formate: string[];
  signaturen: string[];
  boegen: string[];
}) {
  return (
    <>
      <input
        name="bezeichnung"
        defaultValue={row?.bezeichnung ?? ""}
        placeholder="Bezeichnung (optional)"
        style={{ minWidth: 130 }}
      />
      <input
        name="format"
        defaultValue={row?.format ?? ""}
        placeholder="Format"
        list="sb-formate"
        required
        style={{ width: 110 }}
      />
      <select name="ausrichtung" defaultValue={row?.ausrichtung ?? ""} title="wie das PDF angeliefert wird">
        <option value="">– beide –</option>
        <option value="Hochformat">PDF Hochformat</option>
        <option value="Querformat">PDF Querformat</option>
      </select>
      <input
        name="flux_signature"
        defaultValue={row?.flux_signature ?? ""}
        placeholder="flux-Signature"
        list="sb-signaturen"
        required
        style={{ minWidth: 180 }}
      />
      <input
        name="druckbogen"
        defaultValue={row?.druckbogen ?? ""}
        placeholder="Druckbogen"
        list="sb-boegen"
        style={{ width: 100 }}
      />
      <input
        name="nutzen"
        type="number"
        min={1}
        defaultValue={row?.nutzen ?? ""}
        placeholder="Nutzen"
        style={{ width: 72 }}
        title="Stück pro Bogen (Anordnung); leer → Fallback Vernutzung"
      />
      <input name="notiz" defaultValue={row?.notiz ?? ""} placeholder="Notiz" style={{ minWidth: 110 }} />
      <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input type="checkbox" name="aktiv" defaultChecked={row ? row.aktiv : true} /> aktiv
      </label>
      <input
        name="sortierung"
        type="number"
        defaultValue={row?.sortierung ?? 100}
        style={{ width: 60 }}
      />
      {formate.length > 0 && (
        <datalist id="sb-formate">
          {formate.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
      {signaturen.length > 0 && (
        <datalist id="sb-signaturen">
          {signaturen.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {boegen.length > 0 && (
        <datalist id="sb-boegen">
          {boegen.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      )}
    </>
  );
}

function Row({
  row,
  formate,
  signaturen,
  boegen,
}: {
  row: Standbogen;
  formate: string[];
  signaturen: string[];
  boegen: string[];
}) {
  const [state, action, pending] = useActionState(saveStandbogen, empty);
  const [delState, delAction, delPending] = useActionState(deleteStandbogen, empty);
  return (
    <form className="row" action={action} style={{ flexWrap: "wrap", gap: 8 }}>
      <input type="hidden" name="id" value={row.id} />
      <Fields row={row} formate={formate} signaturen={signaturen} boegen={boegen} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      <button
        type="submit"
        formAction={delAction}
        className="ghost"
        disabled={delPending}
        style={{ padding: "5px 10px" }}
      >
        {delPending ? "…" : "löschen"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {(state.error || delState.error) && (
        <span className="msg-err">{state.error || delState.error}</span>
      )}
    </form>
  );
}

function NewRow({
  formate,
  signaturen,
  boegen,
}: {
  formate: string[];
  signaturen: string[];
  boegen: string[];
}) {
  const [state, action, pending] = useActionState(saveStandbogen, empty);
  return (
    <form className="row new" action={action} style={{ flexWrap: "wrap", gap: 8 }}>
      <Fields formate={formate} signaturen={signaturen} boegen={boegen} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Hinzufügen"}
      </button>
      {state.ok && <span className="msg-ok">✓ angelegt</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function StandbogenTable({
  rows,
  formate,
  signaturen,
  boegen,
}: {
  rows: Standbogen[];
  formate: string[];
  signaturen: string[];
  boegen: string[];
}) {
  return (
    <div className="rows">
      <div className="row head" style={{ gap: 8, flexWrap: "wrap" }}>
        <span style={{ minWidth: 130 }}>Bezeichnung</span>
        <span style={{ width: 110 }}>Format</span>
        <span>PDF-Ausrichtung</span>
        <span style={{ minWidth: 180 }}>flux-Signature</span>
        <span style={{ width: 100 }}>Druckbogen</span>
        <span style={{ width: 72 }}>Nutzen</span>
        <span style={{ minWidth: 110 }}>Notiz</span>
        <span>aktiv</span>
        <span style={{ width: 60 }}>Sort.</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} formate={formate} signaturen={signaturen} boegen={boegen} />
      ))}
      <NewRow formate={formate} signaturen={signaturen} boegen={boegen} />
    </div>
  );
}
