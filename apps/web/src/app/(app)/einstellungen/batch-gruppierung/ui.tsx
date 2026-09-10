"use client";

import { useActionState } from "react";
import { saveBatchGruppierung, rebatchOffene, type State } from "./actions";

const empty: State = {};

const FELDER: Record<string, [string, string][]> = {
  druck: [
    ["bindelaenge", "Bindelänge (Schlaufen)"],
    ["spiralfarbe", "Spiralfarbe"],
    ["durchmesser", "Durchmesser"],
    ["teilung", "Teilung"],
    ["verfahren", "Druckverfahren"],
    ["papier", "Papier"],
    ["druckbogen", "Druckbogen"],
    ["format", "Format"],
  ],
  cello: [
    ["bauteil", "Bauteil-Art"],
    ["cello", "Cello (matt/glanz)"],
    ["papier", "Papier"],
  ],
  binden: [
    ["bindeseite", "Bindeseite"],
    ["schlaufen", "Schlaufen (Bindelänge)"],
    ["spiralfarbe", "Spiralfarbe"],
    ["teilung", "Teilung"],
    ["durchmesser", "Durchmesser"],
  ],
  konfektion: [
    ["format", "Format"],
    ["druckbogen", "Druckbogen"],
  ],
};
const TYP_LABEL: Record<string, string> = {
  druck: "Drucken",
  cello: "Cellophanieren",
  binden: "Binden",
  konfektion: "Konfektion",
};

export function BatchGruppierung({ cfg }: { cfg: Record<string, string[]> }) {
  const [state, action, pending] = useActionState(saveBatchGruppierung, empty);
  const [reState, reAction, rePending] = useActionState(rebatchOffene, empty);

  return (
    <>
      <form action={action}>
        {Object.entries(FELDER).map(([typ, felder]) => {
          const sel = new Set(cfg[typ] ?? []);
          return (
            <div
              key={typ}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 12,
                marginBottom: 10,
              }}
            >
              <strong>{TYP_LABEL[typ]}</strong>
              <div className="count" style={{ marginBottom: 6 }}>
                Batch-Schlüssel = ausgewählte Felder, mit „ | " verbunden
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {felder.map(([key, label]) => (
                  <label key={key} className="chk">
                    <input type="checkbox" name={typ} value={key} defaultChecked={sel.has(key)} />{" "}
                    {label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        <div className="toolbar" style={{ gap: 10 }}>
          <button type="submit" disabled={pending}>
            {pending ? "…" : "Speichern"}
          </button>
          {state.ok && <span className="msg-ok">✓ {state.note}</span>}
          {state.error && <span className="msg-err">{state.error}</span>}
        </div>
      </form>

      <form action={reAction} style={{ marginTop: 16 }}>
        <p className="lead" style={{ marginTop: 0 }}>
          Änderungen gelten für neu erzeugte Jobs. Für die bereits offenen (noch nicht an flux
          übergebenen) Aufträge:
        </p>
        <button className="ghost" type="submit" disabled={rePending} style={{ padding: "7px 12px" }}>
          {rePending ? "…" : "Offene Aufträge neu bejobt / neu batchen"}
        </button>
        {reState.ok && <span className="msg-ok"> ✓ {reState.note}</span>}
        {reState.error && <span className="msg-err"> {reState.error}</span>}
      </form>
    </>
  );
}
