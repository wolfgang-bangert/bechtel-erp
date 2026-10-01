"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Name einer verknüpften Organisation klickbar - öffnet die vollständige
 *  Organisationsseite als Modal/Overlay (per iframe, bleibt dadurch 1:1
 *  identisch zur echten Seite ohne Logik-Duplizierung). Schließen bringt
 *  genau zur aufrufenden Detailseite zurück, keine echte Navigation. */
export function OrganizationLink({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: 0,
          background: "none",
          border: "none",
          color: "var(--accent)",
          textDecoration: "underline",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        {name}
      </button>
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
              padding: "4vh 3vw",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                width: "min(1000px, 96vw)",
                height: "90vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                className="toolbar"
                style={{ justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}
              >
                <strong>Organisation</strong>
                <button type="button" onClick={() => setOpen(false)} style={{ padding: "5px 10px" }}>
                  Schließen
                </button>
              </div>
              <iframe src={`/organisationen/${id}`} style={{ flex: 1, border: "none" }} title="Organisation" />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
