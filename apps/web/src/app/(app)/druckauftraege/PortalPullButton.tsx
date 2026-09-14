"use client";

import { useActionState } from "react";
import { requestPortalPullAction, type SyncState } from "./actions";

const empty: SyncState = {};

export type LastPullRequest = {
  status: string;
  requested_at: string;
  finished_at: string | null;
  error: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "wartet auf Verarbeitung",
  running: "läuft gerade",
  done: "zuletzt erfolgreich",
  error: "zuletzt fehlgeschlagen",
};

/** Stößt den vollen Onlineprinters-Abruf an (wie der 5:30-Uhr-Cron), läuft
 *  im Hintergrund im sync-Container (bis zu 2 Minuten Verzögerung + Laufzeit). */
export function PortalPullButton({ last }: { last: LastPullRequest | null }) {
  const [state, action, pending] = useActionState(requestPortalPullAction, empty);

  return (
    <form action={action} className="toolbar" style={{ gap: 8, margin: 0 }}>
      <button type="submit" disabled={pending} style={{ padding: "7px 14px" }}>
        {pending ? "…" : "Aufträge aktualisieren"}
      </button>
      {last && !state.ok && !state.error && (
        <span className="count">
          {STATUS_LABEL[last.status] ?? last.status}
          {last.finished_at
            ? ` · ${new Date(last.finished_at).toLocaleString("de-DE")}`
            : ` · angefragt ${new Date(last.requested_at).toLocaleString("de-DE")}`}
          {last.status === "error" && last.error ? ` (${last.error})` : ""}
        </span>
      )}
      {state.ok && <span className="msg-ok">✓ {state.note}</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
