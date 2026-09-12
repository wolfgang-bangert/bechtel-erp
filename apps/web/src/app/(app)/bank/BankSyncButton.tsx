"use client";

import { useActionState } from "react";
import { requestBankSync, type SyncState } from "./actions";

const empty: SyncState = {};

export type LastSyncRequest = {
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

/** Stößt den FinTS-Bankabruf an (dasselbe wie "werk-banken" im Terminal),
 *  läuft aber im Hintergrund im sync-Container (bis zu 2 Minuten Verzögerung). */
export function BankSyncButton({ last }: { last: LastSyncRequest | null }) {
  const [state, action, pending] = useActionState(requestBankSync, empty);

  return (
    <form action={action} className="toolbar" style={{ gap: 8 }}>
      <button type="submit" disabled={pending} style={{ padding: "7px 14px" }}>
        {pending ? "…" : "Banken aktualisieren"}
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
