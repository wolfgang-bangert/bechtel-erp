"use client";

import { useActionState } from "react";
import { saveRate, deleteRate, type RowState } from "./actions";

export type Carrier = {
  id: string;
  code: string;
  name: string;
  art: string;
  zonen: number;
};
export type Rate = {
  id: string;
  carrier_id: string;
  produkt: string | null;
  zone: number | null;
  kg_von: number;
  kg_bis: number;
  preis: number;
  gilt_ab: string | null;
  gilt_bis: string | null;
};

const empty: RowState = {};

function RateRow({ carrierId, row }: { carrierId: string; row?: Rate }) {
  const [state, action, pending] = useActionState(saveRate, empty);
  const isNew = !row;
  return (
    <form className={isNew ? "row new" : "row"} action={action}>
      <input type="hidden" name="carrier_id" value={carrierId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <input
        name="produkt"
        placeholder="Produkt"
        defaultValue={row?.produkt ?? ""}
        style={{ width: 130 }}
      />
      <input
        name="zone"
        placeholder="Zone"
        defaultValue={row?.zone ?? ""}
        style={{ width: 60 }}
        inputMode="numeric"
      />
      <input
        name="kg_von"
        placeholder="kg von"
        defaultValue={row?.kg_von ?? 0}
        style={{ width: 70 }}
        inputMode="decimal"
      />
      <input
        name="kg_bis"
        placeholder="kg bis"
        defaultValue={row?.kg_bis ?? ""}
        style={{ width: 70 }}
        inputMode="decimal"
        required
      />
      <input
        name="preis"
        placeholder="€"
        defaultValue={row?.preis ?? ""}
        style={{ width: 80 }}
        inputMode="decimal"
        required
      />
      <input
        name="gilt_ab"
        type="date"
        defaultValue={row?.gilt_ab ?? ""}
        title="gilt ab"
        style={{ width: 140 }}
      />
      <input
        name="gilt_bis"
        type="date"
        defaultValue={row?.gilt_bis ?? ""}
        title="gilt bis"
        style={{ width: 140 }}
      />
      <button type="submit" disabled={pending}>
        {pending ? "…" : isNew ? "Hinzufügen" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
      {row && <DeleteButton id={row.id} />}
    </form>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteRate, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="ghost"
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Tarifzeile löschen?")) e.preventDefault();
        }}
      >
        {pending ? "…" : "✕"}
      </button>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function FrachtpreisEditor({
  carriers,
  rates,
}: {
  carriers: Carrier[];
  rates: Rate[];
}) {
  return (
    <>
      {carriers.map((c) => {
        const rows = rates
          .filter((r) => r.carrier_id === c.id)
          .sort(
            (a, b) =>
              (a.zone ?? 0) - (b.zone ?? 0) ||
              (a.produkt ?? "").localeCompare(b.produkt ?? "") ||
              a.kg_bis - b.kg_bis,
          );
        return (
          <section key={c.id} style={{ marginBottom: 28 }}>
            <h2>
              {c.name}{" "}
              <span className="tag">{c.art}</span>{" "}
              <span className="tag">{c.zonen} Zonen</span>{" "}
              <span className="tag">{rows.length} Staffeln</span>
            </h2>
            <div className="rows">
              <div className="row head">
                <span style={{ width: 130 }}>Produkt</span>
                <span style={{ width: 60 }}>Zone</span>
                <span style={{ width: 70 }}>kg von</span>
                <span style={{ width: 70 }}>kg bis</span>
                <span style={{ width: 80 }}>Preis €</span>
                <span style={{ width: 140 }}>gilt ab</span>
                <span style={{ width: 140 }}>gilt bis</span>
              </div>
              {rows.map((r) => (
                <RateRow key={r.id} carrierId={c.id} row={r} />
              ))}
              <RateRow carrierId={c.id} />
            </div>
          </section>
        );
      })}
    </>
  );
}
