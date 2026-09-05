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

export function BatchActions({
  id,
  typ,
  status,
}: {
  id: string;
  typ: string;
  status: string;
  cello?: string;
}) {
  const [fx, fxAction, fxPending] = useActionState(batchAnFluxAction, empty);
  const sammeln = status === "offen" || status === "bereit";

  if (typ === "druck") {
    return (
      <div className="toolbar" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {sammeln && (
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
        {status === "gedruckt" && <StatusButton id={id} status="abgeschlossen" label="abschließen" ghost />}
        {fx.ok && <span className="msg-ok">✓ {fx.note}</span>}
        {fx.error && <span className="msg-err">{fx.error}</span>}
      </div>
    );
  }

  // cello / binden / aufhaenger: rein werk-intern
  const doneLabel = typ === "cello" ? "cellophaniert" : "fertig";
  const doneStatus = typ === "cello" ? "cellophaniert" : "im_druck";
  return (
    <div className="toolbar" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
      {sammeln && <StatusButton id={id} status="im_druck" label="starten" />}
      {(status === "im_druck" || status === "an_flux") && (
        <StatusButton id={id} status={doneStatus} label={doneLabel} />
      )}
      {(status === "im_druck" || status === "gedruckt" || status === "cellophaniert") && (
        <StatusButton id={id} status="abgeschlossen" label="abschließen" ghost />
      )}
    </div>
  );
}
