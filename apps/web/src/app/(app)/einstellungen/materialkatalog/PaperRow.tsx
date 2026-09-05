"use client";

import { useActionState } from "react";
import { setFluxPaperType, setDicke, setFormat, type State } from "./actions";

const empty: State = {};

function MiniForm({
  action,
  id,
  name,
  value,
  list,
  width,
  placeholder,
}: {
  action: (p: State, fd: FormData) => Promise<State>;
  id: string;
  name: string;
  value: string;
  list?: string;
  width: number;
  placeholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, empty);
  return (
    <form action={formAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <input name={name} defaultValue={value} list={list} placeholder={placeholder} style={{ width }} />
      <button type="submit" className="ghost" disabled={pending} style={{ padding: "4px 9px" }}>
        {pending ? "…" : "✓"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

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
    dicke_mm: number | null;
    format: string | null;
    flux_paper_type: string | null;
  };
}) {
  const dickeFehlt = m.dicke_mm == null;

  return (
    <tr style={dickeFehlt ? { background: "var(--danger-bg, rgba(220,50,50,0.06))" } : undefined}>
      <td>
        {m.name_kurz || m.name}
        {m.name_kurz && m.name !== m.name_kurz ? <div className="count">{m.name}</div> : null}
      </td>
      <td className="count">{m.rolle ?? "—"}</td>
      <td className="count">
        {[m.grammatur && `${m.grammatur} g`, m.oberflaeche].filter(Boolean).join(" · ") || "—"}
      </td>
      <td>
        <MiniForm
          action={setFormat}
          id={m.id}
          name="format"
          value={m.format ?? ""}
          list="format-codes"
          width={90}
          placeholder="—"
        />
      </td>
      <td>
        <MiniForm
          action={setDicke}
          id={m.id}
          name="dicke_mm"
          value={m.dicke_mm != null ? String(m.dicke_mm) : ""}
          width={70}
          placeholder={dickeFehlt ? "fehlt!" : "—"}
        />
      </td>
      <td>
        <MiniForm
          action={setFluxPaperType}
          id={m.id}
          name="flux_paper_type"
          value={m.flux_paper_type ?? ""}
          list="flux-papertypes"
          width={220}
          placeholder="—"
        />
      </td>
    </tr>
  );
}
