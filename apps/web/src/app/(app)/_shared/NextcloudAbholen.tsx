"use client";

import { useActionState } from "react";
import { nextcloudAbholen, type AbholenState } from "@/lib/nextcloud/actions";

/** Knopf "Aus Nextcloud holen" - holt den Hotfolder sofort ab und zeigt das Ergebnis. */
export function NextcloudAbholen({ konfiguriert, ordner }: { konfiguriert: boolean; ordner: string }) {
  const [state, action, pending] = useActionState(nextcloudAbholen, {} as AbholenState);
  return (
    <div className="rows" style={{ gap: 4, fontSize: 13 }}>
      <form action={action} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="submit"
          className="bd-btn"
          disabled={pending || !konfiguriert}
          title={konfiguriert ? `PDFs aus dem Nextcloud-Ordner „${ordner}“ holen` : "Nextcloud ist noch nicht eingerichtet"}
        >
          {pending ? "Holt aus Nextcloud…" : "☁ Aus Nextcloud holen"}
        </button>
        {!konfiguriert && <span className="count">Nextcloud noch nicht eingerichtet</span>}
        {!pending && state.text && <span className={state.ok ? "msg-ok" : "msg-err"}>{state.text}</span>}
        {!pending && state.error && <span className="msg-err">{state.error}</span>}
      </form>
      {!pending &&
        state.hinweise?.map((h, i) => (
          <span key={i} className="msg-err">
            {h}
          </span>
        ))}
    </div>
  );
}
