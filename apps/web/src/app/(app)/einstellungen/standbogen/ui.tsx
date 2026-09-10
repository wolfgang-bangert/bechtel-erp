"use client";

import { useActionState } from "react";
import { deleteStandbogen, saveStandbogen, type RowState } from "./actions";

export type Standbogen = {
  id: string;
  bezeichnung: string | null;
  format: string;
  ausrichtung: "Hochformat" | "Querformat" | null;
  flux_signature: string;
  notiz: string | null;
  aktiv: boolean;
  sortierung: number;
};

const empty: RowState = {};

function Fields({
  row,
  formate,
  signaturen,
}: {
  row?: Standbogen;
  formate: string[];
  signaturen: string[];
}) {
  return (
    <>
      <input
        name="bezeichnung"
        defaultValue={row?.bezeichnung ?? ""}
        placeholder="Bezeichnung (optional)"
        style={{ minWidth: 150 }}
      />
      <input
        name="format"
        defaultValue={row?.format ?? ""}
        placeholder="Format"
        list="sb-formate"
        required
        style={{ width: 130 }}
      />
      <select name="ausrichtung" defaultValue={row?.ausrichtung ?? ""}>
        <option value="">– beide –</option>
        <option value="Hochformat">Hochformat</option>
        <option value="Querformat">Querformat</option>
      </select>
      <input
        name="flux_signature"
        defaultValue={row?.flux_signature ?? ""}
        placeholder="flux-Signature"
        list="sb-signaturen"
        required
        style={{ minWidth: 200 }}
      />
      <input name="notiz" defaultValue={row?.notiz ?? ""} placeholder="Notiz" style={{ minWidth: 140 }} />
      <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input type="checkbox" name="aktiv" defaultChecked={row ? row.aktiv : true} /> aktiv
      </label>
      <input
        name="sortierung"
        type="number"
        defaultValue={row?.sortierung ?? 100}
        style={{ width: 64 }}
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
    </>
  );
}

function Row({
  row,
  formate,
  signaturen,
}: {
  row: Standbogen;
  formate: string[];
  signaturen: string[];
}) {
  const [state, action, pending] = useActionState(saveStandbogen, empty);
  const [delState, delAction, delPending] = useActionState(deleteStandbogen, empty);
  return (
    <form className="row" action={action} style={{ flexWrap: "wrap", gap: 8 }}>
      <input type="hidden" name="id" value={row.id} />
      <Fields row={row} formate={formate} signaturen={signaturen} />
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

function NewRow({ formate, signaturen }: { formate: string[]; signaturen: string[] }) {
  const [state, action, pending] = useActionState(saveStandbogen, empty);
  return (
    <form className="row new" action={action} style={{ flexWrap: "wrap", gap: 8 }}>
      <Fields formate={formate} signaturen={signaturen} />
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
}: {
  rows: Standbogen[];
  formate: string[];
  signaturen: string[];
}) {
  return (
    <div className="rows">
      <div className="row head" style={{ gap: 8, flexWrap: "wrap" }}>
        <span style={{ minWidth: 150 }}>Bezeichnung</span>
        <span style={{ width: 130 }}>Format</span>
        <span>Ausrichtung</span>
        <span style={{ minWidth: 200 }}>flux-Signature</span>
        <span style={{ minWidth: 140 }}>Notiz</span>
        <span>aktiv</span>
        <span style={{ width: 64 }}>Sort.</span>
      </div>
      {rows.map((r) => (
        <Row key={r.id} row={r} formate={formate} signaturen={signaturen} />
      ))}
      <NewRow formate={formate} signaturen={signaturen} />
    </div>
  );
}
