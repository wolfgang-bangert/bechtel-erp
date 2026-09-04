"use client";

import { useActionState } from "react";
import { setFluxPaperType, type State } from "./actions";

const empty: State = {};

export function PaperRow({
  m,
}: {
  m: {
    id: string;
    name: string;
    name_kurz: string | null;
    rolle: string | null;
    grammatur: string | null;
    oberflaeche: string | null;
    flux_paper_type: string | null;
  };
}) {
  const [state, action, pending] = useActionState(setFluxPaperType, empty);
  return (
    <tr>
      <td>
        {m.name_kurz || m.name}
        {m.name_kurz && m.name !== m.name_kurz ? <div className="count">{m.name}</div> : null}
      </td>
      <td className="count">{m.rolle ?? "—"}</td>
      <td className="count">
        {[m.grammatur && `${m.grammatur} g`, m.oberflaeche].filter(Boolean).join(" · ") || "—"}
      </td>
      <td>
        <form action={action} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="id" value={m.id} />
          <input
            name="flux_paper_type"
            defaultValue={m.flux_paper_type ?? ""}
            list="flux-papertypes"
            placeholder="—"
            style={{ minWidth: 220 }}
          />
          <button type="submit" className="ghost" disabled={pending} style={{ padding: "4px 9px" }}>
            {pending ? "…" : "✓"}
          </button>
          {state.ok && <span className="msg-ok">gespeichert</span>}
          {state.error && <span className="msg-err">{state.error}</span>}
        </form>
      </td>
    </tr>
  );
}
