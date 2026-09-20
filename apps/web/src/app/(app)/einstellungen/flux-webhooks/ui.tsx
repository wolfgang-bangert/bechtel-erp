"use client";

import { useActionState } from "react";
import { saveFluxWebhookEvent, type RowState } from "./actions";

export type FluxWebhookEvent = {
  id: string;
  key: string;
  label: string;
  gruppe: "auftrag" | "drucker" | "stammdaten";
  opri_bezug: boolean;
  status_optionen: string[];
  aktiv_in_flux: boolean;
  verarbeitet_in_werk: string | null;
  notiz: string | null;
  sortierung: number;
};

const empty: RowState = {};

const GRUPPEN_LABEL: Record<FluxWebhookEvent["gruppe"], string> = {
  auftrag: "Auftrag (opri-Bezug möglich)",
  drucker: "Drucker",
  stammdaten: "Stammdaten",
};

function Row({ row }: { row: FluxWebhookEvent }) {
  const [state, action, pending] = useActionState(saveFluxWebhookEvent, empty);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="id" value={row.id} />
      <span className="w-name">
        {row.label}
        {row.opri_bezug && (
          <span className="tag" style={{ marginLeft: 6 }} title="Lässt sich einem opri-Auftrag zuordnen">
            opri-Auftrag
          </span>
        )}
      </span>
      <label className="chk">
        <input type="checkbox" name="aktiv_in_flux" defaultChecked={row.aktiv_in_flux} /> aktiv in flux
      </label>
      <input name="notiz" defaultValue={row.notiz ?? ""} placeholder="Notiz" className="w-name" />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function FluxWebhookEventTable({ rows }: { rows: FluxWebhookEvent[] }) {
  const gruppen: FluxWebhookEvent["gruppe"][] = ["auftrag", "drucker", "stammdaten"];

  return (
    <div className="rows">
      {gruppen.map((g) => {
        const zeilen = rows
          .filter((r) => r.gruppe === g)
          .sort((a, b) => a.sortierung - b.sortierung);
        if (!zeilen.length) return null;
        return (
          <div key={g} style={{ marginBottom: 16 }}>
            <div className="row head" style={{ fontWeight: 600 }}>
              {GRUPPEN_LABEL[g]}
            </div>
            {zeilen.map((r) => (
              <div key={r.id}>
                <Row row={r} />
                {r.status_optionen.length > 0 && (
                  <p className="count" style={{ marginTop: -6, marginBottom: 8, marginLeft: 4 }}>
                    Status-Optionen: {r.status_optionen.join(", ")}
                  </p>
                )}
                {r.verarbeitet_in_werk && (
                  <p className="count" style={{ marginTop: -6, marginBottom: 8, marginLeft: 4 }}>
                    {r.verarbeitet_in_werk}
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
