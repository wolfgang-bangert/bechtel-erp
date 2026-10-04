"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const KEY = "werk.navstack";
const MAX = 60;

// Bezeichnung für Detailseiten: erstes Pfadsegment -> Einzahl.
const DETAIL_LABEL: Record<string, string> = {
  eingangsrechnungen: "Eingangsrechnung",
  organisationen: "Organisation",
  auftraege: "Auftrag",
  rechnungen: "Rechnung",
  druckauftraege: "Druckauftrag",
  versand: "Sendung",
  abrechnung: "Abrechnung",
  produkte: "Produkt",
  darlehen: "Darlehen",
  bank: "Bank",
  "offene-posten": "Offene Posten",
  einstellungen: "Einstellung",
};

// Im Fenster-Rahmen (z.B. Organisation als Overlay über einem Beleg) hat der Rahmen seinen eigenen
// Verlauf nur im Arbeitsspeicher - sonst würde er den Verlauf der Hauptseite durcheinanderbringen.
let frameStack: string[] = [];
const inFrame = () => typeof window !== "undefined" && window.self !== window.top;

function readStack(): string[] {
  if (inFrame()) return frameStack;
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeStack(s: string[]) {
  if (inFrame()) {
    frameStack = s.slice(-MAX);
    return;
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s.slice(-MAX)));
  } catch {
    /* Speicher gesperrt: Leiste bleibt einfach aus */
  }
}

function labelFor(url: string, navLabels: Record<string, string>): string {
  const path = url.split("?")[0];
  if (navLabels[path]) return navLabels[path];
  const seg = path.split("/").filter(Boolean);
  if (seg.length > 1 && DETAIL_LABEL[seg[0]]) return `${DETAIL_LABEL[seg[0]]} (Detail)`;
  if (seg.length === 1 && navLabels[`/${seg[0]}`]) return navLabels[`/${seg[0]}`];
  return "vorherige Seite";
}

type NavApi = {
  currentEntry: { index: number } | null;
  entries: () => { url: string | null }[];
  addEventListener: (t: string, h: () => void) => void;
  removeEventListener: (t: string, h: () => void) => void;
};
const navApi = (): NavApi | null =>
  typeof window !== "undefined" && "navigation" in window ? ((window as unknown as { navigation: NavApi }).navigation) : null;

/** Vorherige Seite laut Browser-Verlauf (Navigation API) - gilt für jede Art von Zurück. */
function prevFromHistory(): string | null {
  const nav = navApi();
  const idx = nav?.currentEntry?.index ?? -1;
  if (!nav || idx < 1) return null;
  const u = nav.entries()[idx - 1]?.url;
  if (!u) return null;
  try {
    const x = new URL(u);
    if (x.origin !== window.location.origin || x.pathname === "/login") return null;
    return x.pathname + x.search;
  } catch {
    return null;
  }
}

function Inner({ navLabels }: { navLabels: Record<string, string> }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [prev, setPrev] = useState<string | null>(null);
  // "Zurück" (Knopf oder Browser) löst ein popstate-Ereignis aus, normale Links nicht - daran
  // erkennen wir Zurückgehen zuverlässig (ein Vergleich der Adressen würde Vorwärtsklicks auf eine
  // schon besuchte Seite fälschlich als Zurück werten).
  const popped = useRef(false);
  const first = useRef(true);
  useEffect(() => {
    const h = () => {
      popped.current = true;
    };
    // Capture-Phase: läuft vor dem Handler von Next, der die Seite sofort rendert.
    window.addEventListener("popstate", h, true);
    return () => window.removeEventListener("popstate", h, true);
  }, []);

  const query = search.toString();
  const url = pathname + (query ? `?${query}` : "");

  // Besuchte Seiten dieser Sitzung mitführen: bei neuer Seite anhängen, beim Zurückgehen
  // (Knopf oder Browser-Zurück) die oberste entfernen.
  useEffect(() => {
    const nav = navApi();
    if (nav) {
      const upd = () => setPrev(prevFromHistory());
      upd();
      nav.addEventListener("currententrychange", upd);
      return () => nav.removeEventListener("currententrychange", upd);
    }
    const s = readStack();
    // Wurde die Seite per Browser-Zurück komplett neu geladen, gibt es kein popstate - dann
    // verrät es die Navigationsart des Browsers.
    const navType = first.current
      ? (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type
      : undefined;
    const wentBack = popped.current || navType === "back_forward";
    if (s[s.length - 1] === url) {
      // Seite neu geladen o.ä.: nichts ändern
    } else if (wentBack && s.length >= 2 && s[s.length - 2] === url) {
      s.pop();
    } else {
      s.push(url);
    }
    first.current = false;
    popped.current = false;
    writeStack(s);
    setPrev(s.length >= 2 ? s[s.length - 2] : null);
  }, [url]);

  if (!prev) return null;
  return (
    <div className="zurueck-leiste">
      <button type="button" className="zurueck-knopf" onClick={() => {
          popped.current = true;
          router.back();
        }} title={prev}>
        ← Zurück zu {labelFor(prev, navLabels)}
      </button>
    </div>
  );
}

/** "Zurück zur Seite, von der ich gekommen bin" - auf jeder Seite, mit Filtern der Liste. */
export function ZurueckLeiste({ navLabels }: { navLabels: Record<string, string> }) {
  return (
    <Suspense fallback={null}>
      <Inner navLabels={navLabels} />
    </Suspense>
  );
}
