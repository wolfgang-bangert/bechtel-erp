"use client";

import { useActionState } from "react";
import { laufLoeschen, laufStatusSetzen, type State } from "../actions";

const empty: State = {};

/** Je Aktion ein eigenes Formular mit versteckten Feldern (der Schaltflächen-Wert wird bei Server-Actions nicht zuverlässig mitgeschickt). */
export function LaufStatusButtons({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(laufStatusSetzen, empty);
  const [lState, lAction, lPending] = useActionState(laufLoeschen, empty);
  if (status === "verworfen")
    return (
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <span className="count">Verworfen – die Rechnungen sind wieder frei.</span>
        <form action={lAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="ghost"
            disabled={lPending}
            onClick={(e) => { if (!confirm("Verworfenen Zahlungslauf endgültig löschen? Die Rechnungen bleiben unverändert.")) e.preventDefault(); }}
          >
            Lauf löschen
          </button>
        </form>
        {lState.error && <span className="msg-err">{lState.error}</span>}
      </span>
    );
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {status === "erzeugt" && (
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="eingereicht" />
          <button type="submit" disabled={pending}>Bei der Bank eingereicht</button>
        </form>
      )}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="verworfen" />
        <button
          type="submit"
          className="ghost"
          disabled={pending}
          onClick={(e) => { if (!confirm("Zahlungslauf verwerfen? Die Rechnungen werden wieder frei.")) e.preventDefault(); }}
        >
          Verwerfen
        </button>
      </form>
      {state.ok && <span className="msg-ok">✓ gespeichert</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </span>
  );
}
