"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const AVATAR_COLORS = ["#2f6feb", "#c0392b", "#157f3b", "#8e44ad", "#d97706", "#0e7490", "#be185d"];

function avatarColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Kleiner Kreis mit den ersten zwei Buchstaben der Bank - zeigt in der
 *  "alle Konten"-Ansicht auf einen Blick, zu welcher Bank eine Zeile gehört. */
export function BankAvatar({ name }: { name: string }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || "?";
  return (
    <span
      title={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: avatarColor(name),
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        flex: "none",
      }}
    >
      {initials}
    </span>
  );
}

/** Zeile klicken öffnet ein Popup mit der Zuordnung (statt einer eigenen
 *  Tabellenspalte) - hält die Tabelle schlank, Details nur bei Bedarf. */
export function TransactionRow({
  cols,
  title,
  children,
}: {
  cols: React.ReactNode[];
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <tr onClick={() => setOpen(true)} style={{ cursor: "pointer" }}>
        {cols.map((c, i) => (
          <td key={i}>{c}</td>
        ))}
      </tr>
      {open &&
        createPortal(
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.55)",
              zIndex: 100,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "8vh 3vw",
              overflow: "auto",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                width: "min(560px, 100%)",
                maxHeight: "84vh",
                overflow: "auto",
              }}
            >
              <div
                className="toolbar"
                style={{ justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}
              >
                <strong>{title}</strong>
                <button type="button" onClick={() => setOpen(false)} style={{ padding: "5px 10px" }}>
                  Schließen
                </button>
              </div>
              <div style={{ padding: 14 }}>{children}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
