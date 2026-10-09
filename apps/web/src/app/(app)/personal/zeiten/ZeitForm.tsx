"use client";

import { useActionState } from "react";
import { zeitLoeschen, zeitSpeichern, type State } from "../actions";

const empty: State = {};

/** Ein Zeitblock zum Korrigieren (id gesetzt) oder Nachtragen (nur personalId). Zeiten in deutscher Ortszeit. */
export function ZeitForm({
  id,
  personalId,
  beginn,
  ende,
  notiz,
  quelle,
}: {
  id?: string;
  personalId: string;
  beginn?: string;
  ende?: string;
  notiz?: string | null;
  quelle?: string;
}) {
  const [state, action, pending] = useActionState(zeitSpeichern, empty);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {id && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="personal_id" value={personalId} />
        <input type="datetime-local" name="beginn" defaultValue={beginn} required aria-label="Beginn" />
        <span>–</span>
        <input type="datetime-local" name="ende" defaultValue={ende} aria-label="Ende" />
        <input name="notiz" defaultValue={notiz ?? ""} placeholder="Notiz" style={{ width: 160 }} />
        <button type="submit" className="ghost" disabled={pending} style={{ padding: "3px 10px" }}>
          {id ? "Speichern" : "+ Nachtragen"}
        </button>
        {quelle === "manuell" && <span className="tag">manuell</span>}
        {state.ok && <span className="msg-ok">✓</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </form>
      {id && (
        <form
          action={zeitLoeschen}
          onSubmit={(e) => {
            if (!confirm("Diesen Zeiteintrag löschen?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="ghost" style={{ padding: "3px 8px" }} title="Löschen">
            ✕
          </button>
        </form>
      )}
    </div>
  );
}
