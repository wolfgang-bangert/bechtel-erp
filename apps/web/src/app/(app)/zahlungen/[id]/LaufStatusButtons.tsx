"use client";

import { useActionState } from "react";
import { laufStatusSetzen, type State } from "../actions";

const empty: State = {};

export function LaufStatusButtons({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(laufStatusSetzen, empty);
  if (status === "verworfen") return <span className="count">Verworfen – die Rechnungen sind wieder frei.</span>;
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      {status === "erzeugt" && (
        <button type="submit" name="status" value="eingereicht" disabled={pending}>Bei der Bank eingereicht</button>
      )}
      <button
        type="submit"
        name="status"
        value="verworfen"
        className="ghost"
        disabled={pending}
        onClick={(e) => { if (!confirm("Zahlungslauf verwerfen? Die Rechnungen werden wieder frei.")) e.preventDefault(); }}
      >
        Verwerfen
      </button>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
