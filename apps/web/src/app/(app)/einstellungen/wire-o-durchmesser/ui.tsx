"use client";

import { useActionState } from "react";
import { saveWireODurchmesser, deleteWireODurchmesser, type State } from "./actions";

const empty: State = {};

export type Row = {
  id: string;
  teilung: string;
  durchmesser_zoll: string | null;
  durchmesser_mm: number | null;
  blockstaerke_min: number;
  blockstaerke_max: number;
  bezeichnung: string | null;
};

function WRow({ row, teilung, luecke }: { row?: Row; teilung: string; luecke?: string }) {
  const [st, act, p] = useActionState(saveWireODurchmesser, empty);
  const [dst, dact, dp] = useActionState(deleteWireODurchmesser, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={act}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="teilung" value={teilung} />
      <input
        name="durchmesser_zoll"
        defaultValue={row?.durchmesser_zoll ?? ""}
        placeholder="3/4 Zoll"
        style={{ width: 100 }}
      />
      <input
        name="durchmesser_mm"
        defaultValue={row?.durchmesser_mm ?? ""}
        placeholder="mm"
        style={{ width: 64 }}
        inputMode="decimal"
      />
      <span className="count" style={{ width: 90 }}>
        Blockstärke
      </span>
      <input
        name="blockstaerke_min"
        defaultValue={row?.blockstaerke_min ?? ""}
        placeholder="von"
        style={{ width: 64 }}
        inputMode="decimal"
        required
      />
      <span className="count">–</span>
      <input
        name="blockstaerke_max"
        defaultValue={row?.blockstaerke_max ?? ""}
        placeholder="bis"
        style={{ width: 64 }}
        inputMode="decimal"
        required
      />
      <span className="count">mm</span>
      <input
        name="bezeichnung"
        defaultValue={row?.bezeichnung ?? ""}
        placeholder="Bezeichnung (optional)"
        className="w-name"
        style={{ minWidth: 160 }}
      />
      {luecke && (
        <span className="msg-err" title={luecke}>
          ⚠ {luecke}
        </span>
      )}
      <button type="submit" disabled={p}>
        {p ? "…" : isNew ? "Hinzufügen" : "Speichern"}
      </button>
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
            if (!confirm(`"${row.durchmesser_zoll ?? row.id}" löschen?`)) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
      {dst.error && <span className="msg-err">{dst.error}</span>}
    </form>
  );
}

/** Lücke/Überlappung zur vorherigen Zeile derselben Teilung (sortiert nach mm). */
function pruefeLuecke(prev: Row | undefined, cur: Row): string | undefined {
  if (!prev) return undefined;
  const diff = Math.round((cur.blockstaerke_min - prev.blockstaerke_max) * 100) / 100;
  if (diff > 0.01) return `Lücke zu vorheriger Zeile: ${prev.blockstaerke_max} – ${cur.blockstaerke_min} mm ist keinem Durchmesser zugeordnet`;
  if (diff < 0) return `Überlappt vorherige Zeile (bis ${prev.blockstaerke_max} mm)`;
  return undefined;
}

export function WireODurchmesserEditor({ rows }: { rows: Row[] }) {
  const teilungen = [...new Set(rows.map((r) => r.teilung))].sort();

  return (
    <div className="rows">
      {teilungen.map((teilung) => {
        // rows kommt schon sortiert nach durchmesser_mm aus der DB-Query
        const zeilen = rows.filter((r) => r.teilung === teilung);
        return (
          <div key={teilung} style={{ marginBottom: 14 }}>
            <div className="row head" style={{ fontWeight: 600 }}>
              Teilung {teilung} <span className="count">· {zeilen.length}, aufsteigend nach Größe</span>
            </div>
            {zeilen.map((r, i) => (
              <WRow key={r.id} row={r} teilung={teilung} luecke={pruefeLuecke(zeilen[i - 1], r)} />
            ))}
          </div>
        );
      })}

      <div className="row head" style={{ marginTop: 8 }}>
        neue Zeile · Teilung 3:1
      </div>
      <WRow teilung="3:1" />
      <div className="row head" style={{ marginTop: 8 }}>
        neue Zeile · Teilung 2:1
      </div>
      <WRow teilung="2:1" />
    </div>
  );
}
