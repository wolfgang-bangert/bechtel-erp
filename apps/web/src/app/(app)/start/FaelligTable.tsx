"use client";

import { useRouter } from "next/navigation";

export type Gruppe = "heute" | "1tag" | "2-4" | "5plus" | "zukunft";

export type FaelligOrder = {
  id: string;
  external_reference: string | null;
  description: string | null;
  quantity: number | null;
  deliver_date: string;
  ship_to: Record<string, unknown> | null;
  portal_state: string | null;
  tage: number;
  gruppe: Gruppe;
};

const GRUPPE_CLS: Record<Gruppe, string> = {
  heute: "due-heute",
  "1tag": "due-1",
  "2-4": "due-2-4",
  "5plus": "due-5plus",
  zukunft: "due-zukunft",
};
const GRUPPE_LABEL: Record<Gruppe, string> = {
  heute: "heute",
  "1tag": "1 Tag über",
  "2-4": "2–4 Tage über",
  "5plus": "5+ Tage über",
  zukunft: "Zukunft",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE");
}

function adrZeile(a: Record<string, unknown> | null): string {
  if (!a) return "—";
  const g = (k: string) => (a[k] == null ? "" : String(a[k]));
  return [g("company") || g("name"), g("city")].filter(Boolean).join(" · ") || "—";
}

/** Klick auf eine Zeile führt direkt zum Auftrag (Produktionsstatus), nicht zu
 *  einem Versand-Popup - der Auftrag selbst ist hier die zentrale Einheit. */
export function FaelligTable({ rows }: { rows: FaelligOrder[] }) {
  const router = useRouter();

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Fälligkeit</th>
            <th>Auftrag</th>
            <th>Liefertermin</th>
            <th>Empfänger</th>
            <th style={{ textAlign: "right" }}>Menge</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} onClick={() => router.push(`/druckauftraege/${o.id}`)} style={{ cursor: "pointer" }}>
              <td>
                <span
                  className={GRUPPE_CLS[o.gruppe]}
                  style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
                >
                  {GRUPPE_LABEL[o.gruppe]}
                </span>
              </td>
              <td>{o.external_reference ?? o.id.slice(0, 8)}</td>
              <td>{fmtDate(o.deliver_date)}</td>
              <td className="count">{adrZeile(o.ship_to)}</td>
              <td style={{ textAlign: "right" }}>{o.quantity != null ? o.quantity.toLocaleString("de-DE") : "—"}</td>
              <td className="count">{o.portal_state ?? "—"}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} style={{ color: "var(--muted)" }}>
                Keine Aufträge in dieser Gruppe.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
