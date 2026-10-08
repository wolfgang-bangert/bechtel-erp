"use client";

import { useActionState } from "react";
import { rechnungMailVormerkenAction, type State } from "./actions";

const empty: State = {};

export function MailButton({ id, to, label }: { id: string; to: string; label: string }) {
  const [state, action, pending] = useActionState(rechnungMailVormerkenAction, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!confirm(`Rechnung jetzt per E-Mail an ${to} senden?`)) e.preventDefault();
        }}
      >
        {pending ? "…" : label}
      </button>
      {state.ok && <span className="msg-ok"> ✓ {state.note}</span>}
      {state.error && <span className="msg-err"> {state.error}</span>}
    </form>
  );
}
