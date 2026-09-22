"use client";

import { useActionState } from "react";
import { setzePasswort, type PasswortState } from "./actions";

const empty: PasswortState = {};

export function PasswortForm({ neu }: { neu: boolean }) {
  const [state, action, pending] = useActionState(setzePasswort, empty);

  if (state.ok) {
    return <p className="msg-ok">✓ Passwort geändert. Du kannst diese Seite jetzt verlassen.</p>;
  }

  return (
    <form action={action} className="rows" style={{ gap: 10, maxWidth: 320 }}>
      {neu && <p className="lead">Willkommen bei werk - bitte vergib ein eigenes Passwort.</p>}
      <label className="rows" style={{ gap: 2 }}>
        <span className="count">Neues Passwort</span>
        <input name="passwort" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <label className="rows" style={{ gap: 2 }}>
        <span className="count">Wiederholen</span>
        <input name="passwort2" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <div className="toolbar" style={{ gap: 8 }}>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}
