"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <div className="centered">
      <form className="card" action={action}>
        <h1>werk</h1>
        <p className="sub">Anmeldung</p>

        <div className="field">
          <label htmlFor="email">E-Mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>

        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state.error && <div className="banner-err">{state.error}</div>}

        <button type="submit" disabled={pending} style={{ width: "100%" }}>
          {pending ? "…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}
