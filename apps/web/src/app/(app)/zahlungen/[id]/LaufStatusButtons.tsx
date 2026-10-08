"use client";

import { useActionState } from "react";
import { laufStatusSetzen, type State } from "../actions";

const empty: State = {};

/** Je Aktion ein eigenes Formular mit versteckten Feldern (der Schaltflächen-Wert wird bei Server-Actions nicht zuverlässig mitgeschickt). */
export function LaufStatusButtons({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(laufStatusSetzen, empty);
  if (status === "verworfen") return <span className="count">Verworfen – die Rechnungen sind wieder frei.</span>;
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
