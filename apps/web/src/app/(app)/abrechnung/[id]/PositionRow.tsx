"use client";

import { useActionState } from "react";
import Link from "next/link";
import { setBetragAction, positionEntfernenAction, type State } from "../actions";

const empty: State = {};

export type Pos = {
  id: string;
  abrechnung_id: string;
  portal_order_id: string | null;
  referenz: string | null;
  bezeichnung: string | null;
  kategorie: string | null;
  format: string | null;
  auflage: number | null;
  preis_netto: number | null;
  betrag_netto: number;
  ist_rekla: boolean;
  rekla_vermerk: string | null;
  manuell: boolean;
};

export function PositionRow({ p, locked }: { p: Pos; locked: boolean }) {
  const [bs, betragAction, betragPending] = useActionState(setBetragAction, empty);
  const [, delAction, delPending] = useActionState(positionEntfernenAction, empty);

  return (
    <tr style={p.ist_rekla ? { background: "var(--danger-bg, rgba(220,50,50,0.06))" } : undefined}>
      <td>
        {p.portal_order_id ? (
          <Link href={`/druckauftraege/${p.portal_order_id}`}>{p.referenz ?? "—"}</Link>
        ) : (
          (p.referenz ?? "—")
        )}
        {p.ist_rekla && <span className="tag" style={{ marginLeft: 4 }}>Rekla</span>}
      </td>
      <td className="wrap">{p.bezeichnung ?? "—"}</td>
      <td className="count">
        {[p.kategorie, p.format, p.auflage ? `${p.auflage} Ex.` : null].filter(Boolean).join(" · ")}
      </td>
      <td style={{ textAlign: "right" }} className="count">
        {p.preis_netto != null ? `${Number(p.preis_netto).toFixed(2)} €` : "—"}
      </td>
      <td style={{ textAlign: "right" }}>
        {locked ? (
          <>
            {Number(p.betrag_netto).toFixed(2)} €{p.manuell ? " *" : ""}
          </>
        ) : (
          <form action={betragAction} style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="abrechnung_id" value={p.abrechnung_id} />
            <input type="hidden" name="rekla_vermerk" value={p.rekla_vermerk ?? ""} />
            <input
              name="betrag_netto"
              defaultValue={Number(p.betrag_netto).toFixed(2)}
              inputMode="decimal"
              style={{ width: 80, textAlign: "right" }}
            />
            <button type="submit" className="ghost" disabled={betragPending} style={{ padding: "3px 8px" }}>
              {betragPending ? "…" : "✓"}
            </button>
          </form>
        )}
        {bs.error && <div className="msg-err">{bs.error}</div>}
      </td>
      <td className="wrap count">{p.rekla_vermerk ?? ""}</td>
      <td>
        {!locked && (
          <form action={delAction} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="abrechnung_id" value={p.abrechnung_id} />
            <input type="hidden" name="portal_order_id" value={p.portal_order_id ?? ""} />
            <button
              type="submit"
              className="ghost"
              disabled={delPending}
              style={{ padding: "3px 8px" }}
              onClick={(e) => {
                if (!confirm("Position entfernen? Der Auftrag wird wieder frei.")) e.preventDefault();
              }}
            >
              ✕
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
