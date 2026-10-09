"use client";

import { useActionState } from "react";
import { stempelnAction, type StempelState } from "./actions";

const empty: StempelState = {};

/** Große Knöpfe (auch am Handy): je nach Zustand Kommen, bzw. Pause / Gehen, bzw. Weiter / Gehen. */
export function StempelKnoepfe({ zustand }: { zustand: "aus" | "da" | "pause" }) {
  const [state, action, pending] = useActionState(stempelnAction, empty);
  const knopf = (aktion: string, text: string, ghost = false) => (
    <button
      type="submit"
      name="aktion"
      value={aktion}
      disabled={pending}
      className={ghost ? "ghost" : undefined}
      style={{ fontSize: 20, padding: "16px 28px", minWidth: 160 }}
    >
      {text}
    </button>
  );
  return (
    <form action={action} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "16px 0" }}>
      {zustand === "aus" && knopf("kommen", "▶ Kommen")}
      {zustand === "da" && (
        <>
          {knopf("pause", "⏸ Pause", true)}
          {knopf("gehen", "■ Gehen")}
        </>
      )}
      {zustand === "pause" && (
        <>
          {knopf("weiter", "▶ Weiter")}
          {knopf("gehen", "■ Feierabend", true)}
        </>
      )}
      {state.ok && <span className="msg-ok">{state.ok}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
