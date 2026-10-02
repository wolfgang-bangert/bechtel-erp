"use client";

import { useState, useTransition } from "react";
import { erzeugeLaufzettelAction } from "../actions";

export function LaufzettelButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // URL erst NACH dem Erzeugen als echten Link anzeigen (window.open nach einem
  // await wird von den meisten Browsern als Popup geblockt - ein zweiter,
  // bewusster Klick auf einen <a target="_blank"> umgeht das zuverlässig).
  const [url, setUrl] = useState<string | null>(null);

  return (
    <span>
      <button
        type="button"
        className="bd-btn bd-btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            setUrl(null);
            const res = await erzeugeLaufzettelAction(orderId);
            if (res.url) setUrl(res.url);
            else setError(res.error ?? "Laufzettel konnte nicht erzeugt werden.");
          })
        }
      >
        {pending ? "…" : "Laufzettel erzeugen"}
      </button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="bd-btn bd-btn-secondary" style={{ marginLeft: 6 }}>
          Laufzettel öffnen →
        </a>
      )}
      {error && <span className="bd-err" style={{ marginLeft: 8 }}>{error}</span>}
    </span>
  );
}
