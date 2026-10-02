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
    <div className="bd-actions" style={{ marginTop: 8 }}>
      {fluxOrderId ? (
        <>
          {fluxUrl ? (
            <a href={fluxUrl} target="_blank" rel="noreferrer" className="bd-btn bd-btn-secondary bd-btn-sm">
              flux {fluxOrderId} – in flux starten →
            </a>
          ) : (
            <span className="bd-mute">flux {fluxOrderId}</span>
          )}
          {fluxStatus && <span className="bd-mute">Status: {fluxStatus}</span>}
          <form action={action} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={portalOrderId} />
            <button type="submit" className="bd-btn bd-btn-secondary bd-btn-sm" disabled={pending}>
              {pending ? "…" : "erneut senden"}
            </button>
          </form>
        </>
      ) : (
        <form action={action} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={portalOrderId} />
          <button type="submit" className="bd-btn bd-btn-primary bd-btn-sm" disabled={pending}>
            {pending ? "…" : "an flux senden"}
          </button>
        </form>
      )}
      {state.ok && <span className="bd-ok">✓ {state.note}</span>}
      {state.error && <span className="bd-err">{state.error}</span>}
    </div>
  );
}
