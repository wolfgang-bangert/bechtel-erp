"use client";

import { useActionState } from "react";
import { setMaschineFaehigkeiten, type RowState } from "./actions";

export type Faehigkeit = {
  key: string;
  label: string;
  taetigkeit: string;
  art: string;
  einheit: string | null;
  optionen: string[];
};

const empty: RowState = {};

function Wert({ f, wert }: { f: Faehigkeit; wert: unknown }) {
  const name = `f_${f.key}`;
  if (f.art === "flag") {
    return (
      <label className="chk">
        <input type="checkbox" name={name} defaultChecked={wert === true} /> ja
      </label>
    );
  }
  if (f.art === "max" || f.art === "min") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          name={name}
          defaultValue={typeof wert === "number" ? wert : ""}
          style={{ width: 90 }}
        />
        {f.einheit && <span style={{ color: "var(--muted)", fontSize: 12 }}>{f.einheit}</span>}
      </span>
    );
  }
  if (f.art === "liste" && f.optionen.length > 0) {
    const set = new Set(Array.isArray(wert) ? (wert as string[]) : []);
    return (
      <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {f.optionen.map((o) => (
          <label key={o} className="chk">
            <input type="checkbox" name={name} value={o} defaultChecked={set.has(o)} /> {o}
          </label>
        ))}
      </span>
    );
  }
  // liste ohne Optionen → Komma-Feld; text → frei
  const val = Array.isArray(wert) ? (wert as string[]).join(", ") : typeof wert === "string" ? wert : "";
  return (
    <input
      name={name}
      defaultValue={val}
      placeholder={f.art === "liste" ? "Werte, Komma-getrennt" : ""}
      style={{ minWidth: 180 }}
    />
  );
}

export function FaehigkeitenEditor({
  maschineId,
  typ,
  katalog,
  werte,
}: {
  maschineId: string;
  typ: string;
  katalog: Faehigkeit[];
  werte: Record<string, unknown>;
}) {
  const [state, action, pending] = useActionState(setMaschineFaehigkeiten, empty);
  const relevant = katalog.filter((f) => f.taetigkeit === "alle" || f.taetigkeit === typ);
  const keys = JSON.stringify(relevant.map((f) => ({ key: f.key, art: f.art })));

  if (!relevant.length) return null;

  return (
    <form
      action={action}
      style={{
        border: "1px solid var(--border)",
        borderTop: "none",
        borderRadius: "0 0 var(--radius) var(--radius)",
        padding: "10px 12px 12px",
        margin: "-10px 0 14px",
        background: "var(--bg)",
      }}
    >
      <input type="hidden" name="maschine_id" value={maschineId} />
      <input type="hidden" name="keys" value={keys} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Fähigkeiten</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", alignItems: "center" }}>
        {relevant.map((f) => (
          <div key={f.key} style={{ display: "contents" }}>
            <label style={{ fontSize: 13 }}>{f.label}</label>
            <Wert f={f} wert={werte[f.key]} />
          </div>
        ))}
      </div>
      <div className="toolbar" style={{ gap: 10, marginTop: 10, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={{ padding: "5px 12px" }}>
          {pending ? "…" : "Fähigkeiten speichern"}
        </button>
        {state.ok && <span className="msg-ok">✓ gespeichert</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}
