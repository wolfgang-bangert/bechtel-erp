"use client";

import { useState } from "react";

/**
 * Eine Tabellenzeile mit Aufklapper: die übergebenen `cols` sind immer
 * sichtbar (kompakte Übersicht), `children` klappt darunter auf (Jobs +
 * Aktionen) - damit auf einen Blick viele Batches auf den Bildschirm passen.
 */
export function BatchRow({ cols, children }: { cols: React.ReactNode[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        <td style={{ width: 18, color: "var(--muted)" }}>{open ? "▾" : "▸"}</td>
        {cols.map((c, i) => (
          <td key={i}>{c}</td>
        ))}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols.length + 1} style={{ background: "var(--bg)", padding: "10px 14px" }} onClick={(e) => e.stopPropagation()}>
            {children}
          </td>
        </tr>
      )}
    </>
  );
}
