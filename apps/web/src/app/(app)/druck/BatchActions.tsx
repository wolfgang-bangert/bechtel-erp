"use client";

import { useActionState } from "react";
import { batchAnFluxAction, setBatchStatusAction, type State } from "./actions";

const empty: State = {};

function StatusButton({
  id,
  status,
  label,
  ghost,
}: {
  id: string;
  status: string;
  label: string;
  ghost?: boolean;
}) {
  const [state, action, pending] = useActionState(setBatchStatusAction, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={ghost ? "ghost" : undefined} disabled={pending} style={{ padding: "5px 10px" }}>
        {pending ? "…" : label}
      </button>
      {state.error && <span className="msg-err"> {state.error}</span>}
    </form>
  );
}

export function BatchActions({ id, status, cello }: { id: string; status: string; cello: string }) {
  const [fx, fxAction, fxPending] = useActionState(batchAnFluxAction, empty);
  const isCello = cello !== "keine";

  return (
    <div className="toolbar" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
      {(status === "offen" || status === "bereit") && (
        <>
          <form action={fxAction} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" disabled={fxPending} style={{ padding: "5px 10px" }}>
              {fxPending ? "…" : "an flux übergeben"}
            </button>
          </form>
          {status === "offen" ? (
            <StatusButton id={id} status="bereit" label="als bereit markieren" ghost />
          ) : (
            <StatusButton id={id} status="offen" label="wieder sammeln" ghost />
          )}
        </>
      )}

      {status === "an_flux" && <StatusButton id={id} status="gedruckt" label="gedruckt" />}

      {status === "gedruckt" && isCello && (
        <StatusButton id={id} status="cellophaniert" label="cellophaniert" />
      )}

      {(status === "gedruckt" || status === "cellophaniert") && (
        <StatusButton id={id} status="abgeschlossen" label="abschließen" ghost />
      )}

      {fx.ok && <span className="msg-ok">✓ {fx.note}</span>}
      {fx.error && <span className="msg-err">{fx.error}</span>}
    </div>
  );
}
