"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { verschmelzenAction, type State } from "./actions";

export type Kandidat = {
  id: string;
  name: string;
  legal_name: string | null;
  relation: string;
  customer_number: string | null;
  supplier_number: string | null;
  vat_id: string | null;
  email: string | null;
  created_at: string;
  quellen: string[];
  verweise: { label: string; anzahl: number }[];
};

const RELATION_LABEL: Record<string, string> = { customer: "Kunde", supplier: "Lieferant", both: "Kunde + Lieferant" };
const empty: State = {};

export function VerschmelzenForm({ kandidaten }: { kandidaten: Kandidat[] }) {
  const [state, action, pending] = useActionState(verschmelzenAction, empty);
  const [survivor, setSurvivor] = useState(kandidaten[0].id);

  const fuehrend = kandidaten.find((k) => k.id === survivor)!;
  const andere = kandidaten.filter((k) => k.id !== survivor);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const text = `${andere.map((k) => `„${k.name}“`).join(", ")} in „${fuehrend.name}“ verschmelzen? Die anderen Organisationen werden gelöscht.`;
        if (!confirm(text)) e.preventDefault();
      }}
    >
      {kandidaten.map((k) => (
        <input key={k.id} type="hidden" name="ids" value={k.id} />
      ))}
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>führend</th>
              <th>Name</th>
              <th>Typ</th>
              <th>Debitor</th>
              <th>Kreditor</th>
              <th>USt-IdNr</th>
              <th>E-Mail</th>
              <th>Quelle</th>
              <th>Verknüpft</th>
            </tr>
          </thead>
          <tbody>
            {kandidaten.map((k) => (
              <tr key={k.id} style={k.id === survivor ? { background: "var(--tag-bg)" } : undefined}>
                <td>
                  <input
                    type="radio"
                    name="survivor"
                    value={k.id}
                    checked={k.id === survivor}
                    onChange={() => setSurvivor(k.id)}
                    aria-label={`${k.name} als führende wählen`}
                  />
                </td>
                <td className="wrap">
                  <Link href={`/organisationen/${k.id}`} target="_blank">
                    {k.name}
                  </Link>
                  {k.legal_name && k.legal_name !== k.name && <div className="count">{k.legal_name}</div>}
                </td>
                <td>{RELATION_LABEL[k.relation] ?? k.relation}</td>
                <td>{k.customer_number ?? "–"}</td>
                <td>{k.supplier_number ?? "–"}</td>
                <td>{k.vat_id ?? "–"}</td>
                <td>{k.email ?? "–"}</td>
                <td className="wrap">{k.quellen.length ? k.quellen.join(", ") : "werk"}</td>
                <td className="wrap">
                  {k.verweise.length ? k.verweise.map((v) => `${v.anzahl} ${v.label}`).join(", ") : "nichts"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button type="submit" disabled={pending}>
          {pending ? "Verschmelze …" : `${andere.length} in „${fuehrend.name}“ verschmelzen`}
        </button>
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}
