"use client";

import { useActionState } from "react";
import { setPreisAction, loeschePreisAction, type State } from "./actions";

const empty: State = {};

export function PreisZelle({
  id,
  listeId,
  wert,
}: {
  id: string;
  listeId: string;
  wert: number;
}) {
  const [state, action, pending] = useActionState(setPreisAction, empty);
  return (
    <form action={action} style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="liste_id" value={listeId} />
      <input
        name="preis_netto"
        defaultValue={Number(wert).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}
        inputMode="decimal"
        style={{ width: 78, textAlign: "right" }}
      />
      <button type="submit" className="ghost" disabled={pending} style={{ padding: "2px 6px" }}>
        {pending ? "…" : "✓"}
      </button>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function PreisLoeschen({ id, listeId }: { id: string; listeId: string }) {
  const [, action, pending] = useActionState(loeschePreisAction, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="liste_id" value={listeId} />
      <button
        type="submit"
        className="ghost"
        disabled={pending}
        style={{ padding: "2px 6px" }}
        onClick={(e) => {
          if (!confirm("Preiszeile löschen?")) e.preventDefault();
        }}
      >
        ✕
      </button>
    </form>
  );
}
