"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alleKapitelPdfsErzeugen, kapitelPdfErzeugen } from "./archiv/actions";

export function KapitelPdfLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="count"
    >
      Kapitel-PDF ↓
    </a>
  );
}

export function KapitelPdfButton({ kapitelId }: { kapitelId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="ghost"
        disabled={pending}
        style={{ padding: "2px 8px", fontSize: 12 }}
        onClick={() =>
          start(async () => {
            const r = await kapitelPdfErzeugen(kapitelId);
            setFehler(r.error ?? null);
            router.refresh();
          })
        }
      >
        {pending ? "…" : "Kapitel-PDF erzeugen"}
      </button>
      {fehler && <span className="msg-err"> {fehler}</span>}
    </span>
  );
}

export function AlleKapitelPdfsButton({ produktId }: { produktId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ergebnis, setErgebnis] = useState<Awaited<ReturnType<typeof alleKapitelPdfsErzeugen>> | null>(null);

  return (
    <div className="toolbar" style={{ gap: 10 }}>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErgebnis(await alleKapitelPdfsErzeugen(produktId));
            router.refresh();
          })
        }
      >
        {pending ? "Erzeuge Kapitel-PDFs …" : "Alle Kapitel-PDFs erzeugen"}
      </button>
      {ergebnis && !ergebnis.error && (
        <span className="msg-ok">
          ✓ {ergebnis.erzeugt} erzeugt{ergebnis.fehler.length > 0 && ` · ${ergebnis.fehler.length} fehlgeschlagen`}
        </span>
      )}
      {ergebnis?.error && <span className="msg-err">{ergebnis.error}</span>}
      {ergebnis && ergebnis.fehler.length > 0 && (
        <details>
          <summary className="msg-err" style={{ cursor: "pointer" }}>
            Details
          </summary>
          <div className="count">{ergebnis.fehler.join(" · ")}</div>
        </details>
      )}
    </div>
  );
}
