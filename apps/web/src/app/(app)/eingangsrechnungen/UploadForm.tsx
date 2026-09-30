"use client";

import { useActionState, useRef } from "react";
import { uploadIncoming, type UploadIncomingState } from "./actions";

const empty: UploadIncomingState = {};

/** Beleg(e) manuell hochladen - macht denselben ersten Schritt wie der
 *  Mailabruf (PDF ablegen + "captured" anlegen), die KI-Extraktion läuft
 *  danach asynchron über sync_request (siehe actions.ts). Erkennt/teilt dort
 *  auch Sammel-PDFs mit mehreren Rechnungen (z.B. Amazon-Marktplatz-Sammel-
 *  beleg mit mehreren Verkäufern in einer Datei) automatisch auf. */
export function UploadForm() {
  const [state, action, pending] = useActionState(uploadIncoming, empty);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rows" style={{ gap: 6 }}>
      <form
        ref={formRef}
        action={async (fd) => {
          await action(fd);
          formRef.current?.reset();
        }}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input type="file" name="file" accept="application/pdf" multiple required style={{ width: 220 }} />
        <button type="submit" disabled={pending}>
          {pending ? "wird hochgeladen…" : "Beleg(e) hochladen"}
        </button>
        {state.ok && (
          <span className="msg-ok">
            {state.count ? `✓ ${state.count} hochgeladen, Extraktion läuft…` : "bereits erfasst (übersprungen)"}
          </span>
        )}
        {state.error && <span className="msg-err">{state.error}</span>}
      </form>
      {state.uploaded && state.uploaded.length > 0 && (
        <div className="rows" style={{ gap: 4, fontSize: 13 }}>
          {state.uploaded.map((u, i) =>
            u.url ? (
              <a key={i} href={u.url} target="_blank" rel="noreferrer">
                📎 {u.file_name} — hochgeladene Datei prüfen →
              </a>
            ) : (
              <span key={i} className="count">
                📎 {u.file_name} (Vorschau nicht verfügbar)
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
