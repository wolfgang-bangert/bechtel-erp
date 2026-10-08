"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavLink = { href: string; label: string };
export type NavGroup = { label: string; links: NavLink[] };

const STORAGE_KEY = "werk.sidebar.open";

/** Sidebar-Navigation: Gruppen auf-/zuklappbar (gemerkt über localStorage),
 *  die Gruppe der aktuellen Seite ist immer offen - unabhängig vom
 *  gespeicherten Zustand, damit man nie "verloren" wirkt. */
export function Sidebar({
  pinned,
  groups,
  userEmail,
  roles,
  signOutAction,
}: {
  /** Einzelpunkte direkt unter "Start" (ohne Gruppe) */
  pinned: NavLink[];
  groups: NavGroup[];
  userEmail: string;
  roles: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const activeGroupIndex = groups.findIndex((g) => g.links.some((l) => isActive(l.href)));

  const [openSet, setOpenSet] = useState<Set<number>>(
    () => new Set(activeGroupIndex >= 0 ? [activeGroupIndex] : []),
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = new Set<number>(JSON.parse(raw));
        if (activeGroupIndex >= 0) saved.add(activeGroupIndex);
        setOpenSet(saved);
      }
    } catch {
      // localStorage nicht verfügbar - Standardzustand (nur aktive Gruppe offen) bleibt.
    }
    // nur beim Einhängen lesen, nicht bei jedem Pfadwechsel neu überschreiben
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (i: number, open: boolean) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (open) next.add(i);
      else next.delete(i);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // kein Speichern möglich - Zustand gilt nur für diese Sitzung
      }
      return next;
    });
  };

  return (
    <nav className="sidebar">
      <div className="sb-accent sb-accent-top" />
      <Link href="/start" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-bechtel-light.svg" alt="Bechtel Druck" />
        <span className="tool-name">werk</span>
      </Link>

      <div className="nav-body">
        <Link href="/start" className={"nav-pinned" + (isActive("/start") ? " active" : "")}>
          Start
        </Link>
        {pinned.map((l) => (
          <Link key={l.href} href={l.href} className={"nav-pinned" + (isActive(l.href) ? " active" : "")}>
            {l.label}
          </Link>
        ))}

        {groups.map((g, i) => (
          <details
            key={g.label}
            className="nav-group"
            open={openSet.has(i)}
            onToggle={(e) => toggle(i, (e.target as HTMLDetailsElement).open)}
          >
            <summary>
              {g.label}
              <span className="nav-chev">▸</span>
            </summary>
            {g.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={"nav-group-link" + (isActive(l.href) ? " active" : "")}
              >
                {l.label}
              </Link>
            ))}
          </details>
        ))}
      </div>

      <div className="sb-accent sb-accent-bottom" />
      <div className="nav-foot">
        {userEmail}
        <br />
        {roles || "keine Rolle"}
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <Link href="/einstellungen/passwort" className="nav-group-link" style={{ padding: "4px 0" }}>
            Passwort ändern
          </Link>
          <form action={signOutAction}>
            <button className="ghost" type="submit" style={{ width: "100%" }}>
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
