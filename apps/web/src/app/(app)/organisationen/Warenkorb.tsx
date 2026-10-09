"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Warenkorb zum Verschmelzen von Dubletten: Organisationen aus der Liste (oder der Detailseite)
 * hineinlegen, dann unter /organisationen/verschmelzen die führende wählen und verschmelzen.
 * Der Korb liegt im Browser (localStorage) und überlebt Seitenwechsel und Suchen.
 */
export type KorbEintrag = { id: string; name: string };

const SPEICHER = "werk.org-warenkorb";
const EREIGNIS = "werk-org-warenkorb";

export function korbLesen(): KorbEintrag[] {
  try {
    const raw = localStorage.getItem(SPEICHER);
    return raw ? (JSON.parse(raw) as KorbEintrag[]) : [];
  } catch {
    return [];
  }
}

export function korbSchreiben(k: KorbEintrag[]) {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(k));
  } catch {
    /* egal */
  }
  window.dispatchEvent(new Event(EREIGNIS));
}

function useKorb(): KorbEintrag[] {
  const [korb, setKorb] = useState<KorbEintrag[]>([]);
  useEffect(() => {
    const neu = () => setKorb(korbLesen());
    neu();
    window.addEventListener(EREIGNIS, neu);
    window.addEventListener("storage", neu); // andere Tabs
    return () => {
      window.removeEventListener(EREIGNIS, neu);
      window.removeEventListener("storage", neu);
    };
  }, []);
  return korb;
}

/** Knopf je Organisation: in den Korb legen / wieder herausnehmen. */
export function KorbKnopf({ id, name }: KorbEintrag) {
  const korb = useKorb();
  const drin = korb.some((e) => e.id === id);
  return (
    <button
      type="button"
      className="ghost"
      style={{ padding: "2px 8px", whiteSpace: "nowrap" }}
      title={drin ? "Aus dem Warenkorb nehmen" : "In den Warenkorb zum Verschmelzen legen"}
      onClick={() => korbSchreiben(drin ? korb.filter((e) => e.id !== id) : [...korb, { id, name }])}
    >
      {drin ? "✓ im Korb" : "+ Korb"}
    </button>
  );
}

/**
 * Leiste über der Liste: Inhalt des Korbs, Link zum Verschmelzen. Unsichtbar, solange der Korb leer ist.
 * `entfernen`: Organisationen, die gerade verschmolzen wurden, aus dem Korb nehmen.
 */
export function KorbLeiste({ entfernen }: { entfernen?: string[] }) {
  const korb = useKorb();
  const router = useRouter();
  const weg = (entfernen ?? []).join(",");
  useEffect(() => {
    if (!weg) return;
    const ids = new Set(weg.split(","));
    const alt = korbLesen();
    if (alt.some((e) => ids.has(e.id))) korbSchreiben(alt.filter((e) => !ids.has(e.id)));
  }, [weg]);
  if (!korb.length) return null;
  const href = `/organisationen/verschmelzen?ids=${korb.map((e) => e.id).join(",")}`;
  return (
    <div className="banner-info" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <strong>Warenkorb ({korb.length}):</strong>
      {korb.map((e) => (
        <span key={e.id} className="tag" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          {e.name}
          <button
            type="button"
            className="ghost"
            style={{ padding: "0 4px" }}
            title="Herausnehmen"
            onClick={() => korbSchreiben(korb.filter((x) => x.id !== e.id))}
          >
            ✕
          </button>
        </span>
      ))}
      <span style={{ flex: 1 }} />
      {korb.length >= 2 ? (
        <button type="button" onClick={() => router.push(href)}>
          Verschmelzen …
        </button>
      ) : (
        <span className="count">mindestens 2 Organisationen hineinlegen</span>
      )}
      <button type="button" className="ghost" onClick={() => korbSchreiben([])}>
        Korb leeren
      </button>
    </div>
  );
}
