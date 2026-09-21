"use client";

import { useActionState } from "react";
import { saveKapitel, saveProduktteil, type RowState } from "./actions";

export type MaterialOpt = { id: string; label: string };

export type TeilDatei = { id: string; filename: string; url: string | null; quelle: string | null };

export type Teil = {
  id: string;
  typLabel: string;
  nr: string | null;
  titel: string | null;
  material_id: string | null;
  farbigkeit: string | null;
  seitenzahl: number | null;
  registerText: string | null;
  dateien: TeilDatei[];
  ips: string[];
};

const empty: RowState = {};

export function TeilZeile({
  produktId,
  teil,
  materialien,
}: {
  produktId: string;
  teil: Teil;
  materialien: MaterialOpt[];
}) {
  const [state, action, pending] = useActionState(saveProduktteil, empty);
  return (
    <div style={{ marginBottom: 6 }}>
      <form className="row" action={action} style={{ flexWrap: "wrap" }}>
        <input type="hidden" name="id" value={teil.id} />
        <input type="hidden" name="produkt_id" value={produktId} />
        <span className="tag" style={{ minWidth: 92, textAlign: "center" }}>
          {teil.typLabel}
        </span>
        <span style={{ width: 70 }} className="count">
          {teil.nr ?? "—"}
        </span>
        <input name="titel" defaultValue={teil.titel ?? ""} placeholder="Titel" className="w-name" />
        <select name="material_id" defaultValue={teil.material_id ?? ""} style={{ width: 200 }}>
          <option value="">– Material –</option>
          {materialien.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <input name="farbigkeit" defaultValue={teil.farbigkeit ?? ""} placeholder="4/4" style={{ width: 60 }} />
        <span className="count" style={{ width: 70 }}>
          {teil.seitenzahl != null ? `${teil.seitenzahl} S.` : ""}
        </span>
        <span className="count" style={{ width: 130 }}>
          {teil.registerText ?? ""}
        </span>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
        {state.ok && <span className="msg-ok">✓</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </form>
      <div className="count" style={{ marginLeft: 8, marginTop: 2 }}>
        {teil.dateien.length > 0 ? (
          teil.dateien.map((d) =>
            d.url ? (
              <a key={d.id} href={d.url} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>
                {d.filename}
              </a>
            ) : (
              <span key={d.id} style={{ marginRight: 12 }}>
                {d.filename}
              </span>
            ),
          )
        ) : (
          <>
            keine Datei
            {teil.ips.length > 0 && <> · geplant: {teil.ips.map((ip) => `IP ${ip}`).join(", ")}</>}
          </>
        )}
      </div>
    </div>
  );
}

export function KapitelName({
  produktId,
  kapitelId,
  name,
}: {
  produktId: string;
  kapitelId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(saveKapitel, empty);
  return (
    <form className="row" action={action} style={{ borderBottom: "none", padding: "2px 0" }}>
      <input type="hidden" name="id" value={kapitelId} />
      <input type="hidden" name="produkt_id" value={produktId} />
      <span className="count" style={{ width: 70 }}>
        Kapitelname
      </span>
      <input name="name" defaultValue={name} className="w-name" required />
      <button type="submit" className="ghost" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
