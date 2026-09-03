"use client";

import { useActionState } from "react";
import {
  saveFormat,
  deleteFormat,
  saveBogen,
  deleteBogen,
  type RowState,
} from "./actions";

const empty: RowState = {};

export type Format = {
  id: string;
  code: string;
  name: string;
  breite_mm: number | null;
  hoehe_mm: number | null;
  kategorie: string;
  is_active: boolean;
};
export type Bogen = {
  id: string;
  code: string;
  name: string;
  breite_mm: number;
  hoehe_mm: number;
  greifer_mm: number;
  is_default: boolean;
  is_active: boolean;
};

function FormatRow({ row }: { row?: Format }) {
  const [st, act, p] = useActionState(saveFormat, empty);
  const [dst, dact, dp] = useActionState(deleteFormat, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={act}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input className="w-code" name="code" defaultValue={row?.code ?? ""} placeholder="Code" required />
      <input className="w-name" name="name" defaultValue={row?.name ?? ""} placeholder="Name" required />
      <input name="breite_mm" defaultValue={row?.breite_mm ?? ""} placeholder="B mm" style={{ width: 70 }} inputMode="decimal" />
      <input name="hoehe_mm" defaultValue={row?.hoehe_mm ?? ""} placeholder="H mm" style={{ width: 70 }} inputMode="decimal" />
      <select name="kategorie" defaultValue={row?.kategorie ?? "din"} style={{ width: 90 }}>
        <option value="din">DIN</option>
        <option value="quadrat">Quadrat</option>
        <option value="sonder">Sonder</option>
      </select>
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={row?.is_active ?? true} /> aktiv
      </label>
      <button type="submit" disabled={p}>{p ? "…" : isNew ? "Hinzufügen" : "Speichern"}</button>
      {st.ok && <span className="msg-ok">✓</span>}
      {st.error && <span className="msg-err">{st.error}</span>}
      {row && (
        <button
          type="submit"
          className="ghost"
          formAction={dact}
          formNoValidate
          disabled={dp}
          onClick={(e) => {
            if (!confirm("Format löschen?")) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
      {dst.error && <span className="msg-err">{dst.error}</span>}
    </form>
  );
}

function BogenRow({ row }: { row?: Bogen }) {
  const [st, act, p] = useActionState(saveBogen, empty);
  const [dst, dact, dp] = useActionState(deleteBogen, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={act}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input className="w-code" name="code" defaultValue={row?.code ?? ""} placeholder="Code" required />
      <input className="w-name" name="name" defaultValue={row?.name ?? ""} placeholder="Name" required />
      <input name="breite_mm" defaultValue={row?.breite_mm ?? ""} placeholder="B mm" style={{ width: 70 }} inputMode="decimal" required />
      <input name="hoehe_mm" defaultValue={row?.hoehe_mm ?? ""} placeholder="H mm" style={{ width: 70 }} inputMode="decimal" required />
      <input name="greifer_mm" defaultValue={row?.greifer_mm ?? 0} placeholder="Greifer" style={{ width: 70 }} inputMode="decimal" title="nutzbare Höhe = Höhe − Greifer" />
      <label className="chk">
        <input type="checkbox" name="is_default" defaultChecked={row?.is_default ?? false} /> Standard
      </label>
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={row?.is_active ?? true} /> aktiv
      </label>
      <button type="submit" disabled={p}>{p ? "…" : isNew ? "Hinzufügen" : "Speichern"}</button>
      {st.ok && <span className="msg-ok">✓</span>}
      {st.error && <span className="msg-err">{st.error}</span>}
      {row && (
        <button type="submit" className="ghost" formAction={dact} formNoValidate disabled={dp}
          onClick={(e) => { if (!confirm("Druckbogen löschen?")) e.preventDefault(); }}>
          ✕
        </button>
      )}
      {dst.error && <span className="msg-err">{dst.error}</span>}
    </form>
  );
}

export function FormateEditor({ formate, boegen }: { formate: Format[]; boegen: Bogen[] }) {
  return (
    <>
      <h2>Endformate</h2>
      <div className="rows">
        <div className="row head">
          <span className="w-code">Code</span>
          <span className="w-name">Name</span>
          <span style={{ width: 70 }}>B mm</span>
          <span style={{ width: 70 }}>H mm</span>
          <span style={{ width: 90 }}>Kategorie</span>
        </div>
        {formate.map((f) => (
          <FormatRow key={f.id} row={f} />
        ))}
        <FormatRow />
      </div>

      <h2>Druckbögen</h2>
      <div className="rows">
        <div className="row head">
          <span className="w-code">Code</span>
          <span className="w-name">Name</span>
          <span style={{ width: 70 }}>B mm</span>
          <span style={{ width: 70 }}>H mm</span>
          <span style={{ width: 70 }}>Greifer</span>
        </div>
        {boegen.map((b) => (
          <BogenRow key={b.id} row={b} />
        ))}
        <BogenRow />
      </div>
    </>
  );
}
