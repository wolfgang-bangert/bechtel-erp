"use client";

import { useActionState } from "react";
import { deleteFaehigkeit, saveFaehigkeit, type RowState } from "./actions";

export type Faehigkeit = {
  key: string;
  label: string;
  taetigkeit: string;
  art: string;
  einheit: string | null;
  optionen: string[];
  sortierung: number;
};

const empty: RowState = {};
const TAETIGKEIT = ["alle", "druck", "cello", "binden", "konfektion", "sonstige"];
const ART: Record<string, string> = {
  liste: "Liste / Menge",
  max: "Max-Wert",
  min: "Min-Wert",
  flag: "Ja / Nein",
  text: "Text",
};

function Fields({ row }: { row?: Faehigkeit }) {
  return (
    <>
      <input
        name="key"
        defaultValue={row?.key}
        placeholder="schluessel"
        required
        style={{ width: 150, fontFamily: "monospace" }}
        readOnly={!!row}
      />
      <input name="label" defaultValue={row?.label} placeholder="Bezeichnung" required style={{ minWidth: 160 }} />
      <select name="taetigkeit" defaultValue={row?.taetigkeit ?? "alle"}>
        {TAETIGKEIT.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select name="art" defaultValue={row?.art ?? "liste"}>
        {Object.entries(ART).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <input name="einheit" defaultValue={row?.einheit ?? ""} placeholder="Einheit" style={{ width: 70 }} />
      <input
        name="optionen"
        defaultValue={(row?.optionen ?? []).join(", ")}
        placeholder="Optionen (Komma, nur bei Liste)"
        style={{ minWidth: 200 }}
      />
      <input name="sortierung" type="number" defaultValue={row?.sortierung ?? 100} style={{ width: 64 }} />
    </>
  );
}

function Row({ row }: { row: Faehigkeit }) {
  const [state, action, pending] = useActionState(saveFaehigkeit, empty);
  const [delState, delAction, delPending] = useActionState(deleteFaehigkeit, empty);
  return (
    <form className="row" action={action} style={{ flexWrap: "wrap", gap: 8 }}>
      <input type="hidden" name="original_key" value={row.key} />
      <Fields row={row} />
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
      {(state.error || delState.error) && <span className="msg-err">{state.error || delState.error}</span>}
    </form>
  );
}

function NewRow() {
  const [state, action, pending] = useActionState(saveFaehigkeit, empty);
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

export function FaehigkeitTable({ rows }: { rows: Faehigkeit[] }) {
  return (
    <div className="rows">
      <div className="row head" style={{ gap: 8, flexWrap: "wrap" }}>
        <span style={{ width: 150 }}>Schlüssel</span>
        <span style={{ minWidth: 160 }}>Bezeichnung</span>
        <span>Tätigkeit</span>
        <span>Art</span>
        <span style={{ width: 70 }}>Einheit</span>
        <span style={{ minWidth: 200 }}>Optionen</span>
        <span style={{ width: 64 }}>Sort.</span>
      </div>
      {rows.map((r) => (
        <Row key={r.key} row={r} />
      ))}
      <NewRow />
    </div>
  );
}
