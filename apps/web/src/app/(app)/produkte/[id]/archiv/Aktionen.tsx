"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { erzeugeEinzeldateien, loescheArchivDatei } from "./actions";

export function EinzeldateienButton({ produktId }: { produktId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ergebnis, setErgebnis] = useState<Awaited<ReturnType<typeof erzeugeEinzeldateien>> | null>(null);

  return (
    <div className="rows" style={{ gap: 6 }}>
      <div className="toolbar" style={{ gap: 10 }}>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErgebnis(await erzeugeEinzeldateien(produktId));
              router.refresh();
            })
          }
        >
          {pending ? "Erzeuge Einzeldateien …" : "Einzeldateien erzeugen"}
        </button>
        {ergebnis && !ergebnis.error && (
          <span className="msg-ok">
            ✓ {ergebnis.erzeugt} Register-Einzeldateien erzeugt · {ergebnis.verknuepft} Inhaltsdateien zugeordnet ·{" "}
            {ergebnis.uebersprungen} schon vorhanden
          </span>
        )}
        {ergebnis?.error && <span className="msg-err">{ergebnis.error}</span>}
      </div>
      {ergebnis && ergebnis.fehlend.length > 0 && (
        <details open>
          <summary className="msg-err" style={{ cursor: "pointer" }}>
            {ergebnis.fehlend.length} Quelle(n) fehlen im Archiv
          </summary>
          <div className="count">{ergebnis.fehlend.join(" · ")}</div>
        </details>
      )}
    </div>
  );
}

export function LoeschenButton({ archivId, produktId, name }: { archivId: string; produktId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="ghost"
      disabled={pending}
      title="Aus dem Archiv löschen"
      onClick={() => {
        if (!confirm(`"${name}" aus dem Archiv löschen? Damit erzeugte Verknüpfungen fallen ebenfalls weg.`)) return;
        start(async () => {
          await loescheArchivDatei(archivId, produktId);
          router.refresh();
        });
      }}
    >
      ✕
    </button>
  );
}
