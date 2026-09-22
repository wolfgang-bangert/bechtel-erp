"use client";

import { useActionState, useState } from "react";
import { signIn, requestPasswordReset, type LoginState, type ResetState } from "./actions";

const initialLogin: LoginState = {};
const initialReset: ResetState = {};

function LoginForm({ onVergessen }: { onVergessen: () => void }) {
  const [state, action, pending] = useActionState(signIn, initialLogin);

  return (
    <form className="card" action={action}>
      <h1>werk</h1>
      <p className="sub">Anmeldung</p>

      <div className="field">
        <label htmlFor="email">E-Mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <div className="field">
        <label htmlFor="password">Passwort</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      {state.error && <div className="banner-err">{state.error}</div>}

      <button type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "…" : "Anmelden"}
      </button>
      <button type="button" className="ghost" onClick={onVergessen} style={{ width: "100%", marginTop: 8 }}>
        Passwort vergessen?
      </button>
    </form>
  );
}

function VergessenForm({ onZurueck }: { onZurueck: () => void }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initialReset);

  if (state.ok) {
    return (
      <div className="card">
        <h1>werk</h1>
        <p className="sub">Passwort vergessen</p>
        <p className="msg-ok">
          Falls diese Adresse bei uns hinterlegt ist, kommt gleich eine E-Mail mit einem Link zum Setzen eines neuen
          Passworts.
        </p>
        <button type="button" className="ghost" onClick={onZurueck} style={{ width: "100%" }}>
          ← zurück zur Anmeldung
        </button>
      </div>
    );
  }

  return (
    <form className="card" action={action}>
      <input type="hidden" name="origin" value={typeof window !== "undefined" ? window.location.origin : ""} />
      <h1>werk</h1>
      <p className="sub">Passwort vergessen</p>

      <div className="field">
        <label htmlFor="reset-email">E-Mail</label>
        <input id="reset-email" name="email" type="email" autoComplete="username" required />
      </div>

      {state.error && <div className="banner-err">{state.error}</div>}

      <button type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "…" : "Link zusenden"}
      </button>
      <button type="button" className="ghost" onClick={onZurueck} style={{ width: "100%", marginTop: 8 }}>
        ← zurück zur Anmeldung
      </button>
    </form>
  );
}

export default function LoginPage() {
  const [vergessen, setVergessen] = useState(false);

  return (
    <div className="centered">
      {vergessen ? (
        <VergessenForm onZurueck={() => setVergessen(false)} />
      ) : (
        <LoginForm onVergessen={() => setVergessen(true)} />
      )}
    </div>
  );
}
