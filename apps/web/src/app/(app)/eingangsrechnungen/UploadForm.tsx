"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { uploadIncoming, type UploadIncomingState } from "./actions";

const empty: UploadIncomingState = {};

/** Beleg(e) manuell hochladen: eine oder mehrere PDFs in das Feld ziehen (oder anklicken und wählen) -
 *  der Upload startet sofort. Macht denselben ersten Schritt wie der Mailabruf (PDF ablegen + "captured"
 *  anlegen), die KI-Extraktion läuft danach asynchron über sync_request (siehe actions.ts). Erkennt/teilt dort
 *  auch Sammel-PDFs mit mehreren Rechnungen (z.B. Amazon-Marktplatz-Sammelbeleg) automatisch auf. */
export function UploadForm() {
  const [state, action, pending] = useActionState(uploadIncoming, empty);
  const [drag, setDrag] = useState(false);
  const [gesendet, setGesendet] = useState<string[]>([]);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hochladen = (liste: FileList | File[]) => {
    const alle = Array.from(liste);
    const pdfs = alle.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    setHinweis(pdfs.length < alle.length ? `${alle.length - pdfs.length} Datei(en) übersprungen – nur PDF möglich.` : null);
    if (!pdfs.length) return;
    const fd = new FormData();
    for (const f of pdfs) fd.append("file", f);
    setGesendet(pdfs.map((f) => f.name));
    startTransition(() => action(fd));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rows" style={{ gap: 6, fontFamily: "var(--font-bd-sans)" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !pending && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !pending && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!pending) hochladen(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${drag ? "var(--accent, #2b6cb0)" : "var(--border)"}`,
          background: drag ? "var(--tag-bg)" : "transparent",
          borderRadius: 8,
          padding: "18px 20px",
          textAlign: "center",
          cursor: pending ? "wait" : "pointer",
          color: "var(--muted)",
        }}
      >
        {pending
          ? `${gesendet.length} Datei(en) werden hochgeladen…`
          : drag
            ? "Loslassen zum Hochladen"
            : "Belege (PDF) hier hineinziehen – eine oder mehrere – oder klicken zum Auswählen"}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && hochladen(e.target.files)}
        />
      </div>

      {!pending && state.ok && (
        <span className="msg-ok">
          {state.count
            ? `✓ ${state.count} hochgeladen, Extraktion läuft…${gesendet.length > state.count ? ` (${gesendet.length - state.count} schon erfasst, übersprungen)` : ""}`
            : "Alles schon erfasst (übersprungen)."}
        </span>
      )}
      {state.error && <span className="msg-err">{state.error}</span>}
      {hinweis && <span className="msg-err">{hinweis}</span>}
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
