"use client";

import { useActionState } from "react";
import { auftragAnFluxAction, type State } from "./actions";

const empty: State = {};

/**
 * Einzelübergabe eines Auftrags an flux aus der Batch-Liste.
 * Vor dem Senden: Button „an flux senden". Danach: flux-Nummer als Direktlink
 * (in flux Auftrag starten) + „erneut senden".
 */
export function FluxOrderButton({
  portalOrderId,
  fluxOrderId,
  fluxStatus,
  fluxUrl,
}: {
  portalOrderId: string;
  fluxOrderId: string | null;
  fluxStatus: string | null;
  fluxUrl: string | null;
}) {
  const [state, action, pending] = useActionState(auftragAnFluxAction, empty);

  return (
    <div className="toolbar" style={{ gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
      {fluxOrderId ? (
        <>
          {fluxUrl ? (
            <a href={fluxUrl} target="_blank" rel="noreferrer" className="ghost" style={{ padding: "4px 10px" }}>
              flux {fluxOrderId} – in flux starten →
            </a>
          ) : (
            <span className="count">flux {fluxOrderId}</span>
          )}
          {fluxStatus && <span className="count">Status: {fluxStatus}</span>}
          <form action={action} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={portalOrderId} />
            <button type="submit" className="ghost" disabled={pending} style={{ padding: "4px 10px" }}>
              {pending ? "…" : "erneut senden"}
            </button>
          </form>
        </>
      ) : (
        <form action={action} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={portalOrderId} />
          <button type="submit" disabled={pending} style={{ padding: "4px 12px" }}>
            {pending ? "…" : "an flux senden"}
          </button>
        </form>
      )}
      {state.ok && <span className="msg-ok">✓ {state.note}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </div>
  );
}
