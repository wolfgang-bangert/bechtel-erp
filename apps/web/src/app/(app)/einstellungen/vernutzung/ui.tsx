"use client";

import { useActionState } from "react";
import {
  saveVernutzung,
  deleteVernutzung,
  generateVorschlaege,
  type State,
} from "./actions";

const empty: State = {};

export type Opt = { id: string; label: string };
export type Row = {
  id: string;
  format_id: string;
  druckbogen_id: string;
  nutzen: number;
  anordnung: string | null;
  gedreht: boolean;
  randzugabe_mm: number;
  ist_standard: boolean;
  quelle: string;
  notiz: string | null;
};

function VRow({
  row,
  formate,
  boegen,
}: {
  row?: Row;
  formate: Opt[];
  boegen: Opt[];
}) {
  const [st, act, p] = useActionState(saveVernutzung, empty);
  const [dst, dact, dp] = useActionState(deleteVernutzung, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={act}>
      {row && <input type="hidden" name="id" value={row.id} />}
      {row ? (
        <>
          <input type="hidden" name="format_id" value={row.format_id} />
          <input type="hidden" name="druckbogen_id" value={row.druckbogen_id} />
          <span className="w-name" style={{ minWidth: 200 }}>
            {formate.find((f) => f.id === row.format_id)?.label ?? "?"}
          </span>
          <span style={{ width: 150 }}>
            {boegen.find((b) => b.id === row.druckbogen_id)?.label ?? "?"}
          </span>
        </>
      ) : (
        <>
          <select name="format_id" required style={{ minWidth: 200 }} defaultValue="">
            <option value="">Format…</option>
            {formate.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <select name="druckbogen_id" required style={{ width: 150 }} defaultValue="">
            <option value="">Bogen…</option>
            {boegen.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </>
      )}
      <input name="nutzen" defaultValue={row?.nutzen ?? 1} placeholder="Nutzen" style={{ width: 64 }} inputMode="numeric" />
      <input name="anordnung" defaultValue={row?.anordnung ?? ""} placeholder="2×1" style={{ width: 56 }} />
      <input name="randzugabe_mm" defaultValue={row?.randzugabe_mm ?? 4} placeholder="Rand" style={{ width: 56 }} inputMode="decimal" />
      <label className="chk">
        <input type="checkbox" name="gedreht" defaultChecked={row?.gedreht ?? false} /> gedreht
      </label>
      <label className="chk">
        <input type="checkbox" name="ist_standard" defaultChecked={row?.ist_standard ?? false} /> ★
      </label>
      {row && <span className="tag">{row.quelle}</span>}
      <button type="submit" disabled={p}>{p ? "…" : isNew ? "Hinzufügen" : "Speichern"}</button>
      {st.ok && <span className="msg-ok">✓</span>}
      {st.error && <span className="msg-err">{st.error}</span>}
      {row && (
        <button type="submit" className="ghost" formAction={dact} formNoValidate disabled={dp}
          onClick={(e) => { if (!confirm("Zeile löschen?")) e.preventDefault(); }}>
          ✕
        </button>
      )}
      {dst.error && <span className="msg-err">{dst.error}</span>}
    </form>
  );
}

function GenButton() {
  const [st, act, p] = useActionState(generateVorschlaege, empty);
  return (
    <form action={act} className="toolbar" style={{ margin: 0 }}>
      <input name="randzugabe_mm" defaultValue={4} style={{ width: 60 }} title="Randzugabe mm" />
      <button type="submit" disabled={p}>{p ? "…" : "Vorschläge erzeugen"}</button>
      {st.ok && <span className="msg-ok">✓ {st.note}</span>}
      {st.error && <span className="msg-err">{st.error}</span>}
    </form>
  );
}

export function VernutzungEditor({
  rows,
  formate,
  boegen,
}: {
  rows: Row[];
  formate: Opt[];
  boegen: Opt[];
}) {
  const byFormat = new Map<string, Row[]>();
  for (const r of rows) {
    const a = byFormat.get(r.format_id) ?? [];
    a.push(r);
    byFormat.set(r.format_id, a);
  }
  return (
    <>
      <div className="toolbar">
        <GenButton />
        <span className="count">{rows.length} Zeilen</span>
      </div>
      <div className="rows">
        {formate
          .filter((f) => byFormat.has(f.id))
          .map((f) => (
            <div key={f.id} style={{ marginBottom: 10 }}>
              <div className="row head" style={{ fontWeight: 600 }}>{f.label}</div>
              {(byFormat.get(f.id) ?? [])
                .sort((a, b) => b.nutzen - a.nutzen)
                .map((r) => (
                  <VRow key={r.id} row={r} formate={formate} boegen={boegen} />
                ))}
            </div>
          ))}
        <div className="row head" style={{ marginTop: 8 }}>manuell hinzufügen</div>
        <VRow formate={formate} boegen={boegen} />
      </div>
    </>
  );
}
