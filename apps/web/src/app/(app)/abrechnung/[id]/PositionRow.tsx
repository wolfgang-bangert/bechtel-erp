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
  /** aus dem Auftrag gelesen */
  versand_datum: string | null;
  preis_quelle: string | null;
  preisliste: string | null;
};

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QUELLE: Record<string, string> = { auto: "automatisch", manuell: "manuell", kein_treffer: "kein Treffer" };

export function abweichung(p: Pick<Pos, "preis_netto" | "betrag_netto">): number {
  return Math.round((Number(p.betrag_netto) - Number(p.preis_netto ?? 0)) * 100) / 100;
}

export function PositionRow({ p, locked }: { p: Pos; locked: boolean }) {
  const [bs, betragAction, betragPending] = useActionState(setBetragAction, empty);
  const [, delAction, delPending] = useActionState(positionEntfernenAction, empty);
  const diff = abweichung(p);
  const geaendert = Math.abs(diff) > 0.004;
  const ohneBegruendung = geaendert && !p.rekla_vermerk?.trim();
  const merkmale = [p.kategorie, p.format, p.auflage ? `${p.auflage} Ex.` : null].filter(Boolean).join(" · ");

  return (
    <tr style={p.ist_rekla ? { background: "var(--danger-bg, rgba(220,50,50,0.06))" } : undefined}>
      <td>
        {p.portal_order_id ? (
          <Link href={`/druckauftraege/${p.portal_order_id}`}>{p.referenz ?? "—"}</Link>
        ) : (
          (p.referenz ?? "—")
        )}
        {p.ist_rekla && <span className="tag" style={{ marginLeft: 4 }}>Rekla</span>}
        {geaendert && !p.ist_rekla && <span className="tag" style={{ marginLeft: 4 }}>geändert</span>}
        <div className="count">{p.versand_datum ? p.versand_datum.split("-").reverse().join(".") : "kein Versand"}</div>
      </td>
      <td className="wrap">
        {p.bezeichnung ?? "—"}
        <div className="count">{merkmale}</div>
      </td>
      <td className="count">
        {p.preisliste ?? "—"}
        <div>{p.preis_quelle ? (QUELLE[p.preis_quelle] ?? p.preis_quelle) : ""}</div>
      </td>
      <td style={{ textAlign: "right" }} className="count">
        {p.preis_netto != null ? `${eur(Number(p.preis_netto))} €` : "—"}
      </td>
      {locked ? (
        <>
          <td style={{ textAlign: "right" }}>{eur(Number(p.betrag_netto))} €</td>
          <td style={{ textAlign: "right" }} className="count">
            {geaendert ? `${diff > 0 ? "+" : ""}${eur(diff)} €` : ""}
          </td>
          <td className="wrap count">{p.rekla_vermerk ?? ""}</td>
          <td />
        </>
      ) : (
        <>
          <td colSpan={3}>
            <form action={betragAction} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="abrechnung_id" value={p.abrechnung_id} />
              <input
                name="betrag_netto"
                defaultValue={Number(p.betrag_netto).toFixed(2)}
                inputMode="decimal"
                aria-label="Betrag netto"
                style={{ width: 84, textAlign: "right" }}
              />
              <span className="count" style={{ width: 80, textAlign: "right", paddingTop: 6 }}>
                {geaendert ? `${diff > 0 ? "+" : ""}${eur(diff)} €` : ""}
              </span>
              <textarea
                name="rekla_vermerk"
                defaultValue={p.rekla_vermerk ?? ""}
                rows={1}
                placeholder={ohneBegruendung ? "Begründung fehlt" : "Begründung (erscheint auf der Aufstellung)"}
                aria-label="Begründung"
                style={{ flex: 1, minWidth: 220, ...(ohneBegruendung ? { borderColor: "var(--danger, #c33)" } : {}) }}
              />
              <button type="submit" className="ghost" disabled={betragPending} style={{ padding: "3px 8px" }}>
                {betragPending ? "…" : "✓"}
              </button>
            </form>
            {bs.error && <div className="msg-err">{bs.error}</div>}
          </td>
          <td>
            <form action={delAction} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="abrechnung_id" value={p.abrechnung_id} />
              <input type="hidden" name="portal_order_id" value={p.portal_order_id ?? ""} />
              <button type="submit" className="ghost" disabled={delPending} style={{ padding: "3px 8px" }} title="Position entfernen"
                onClick={(e) => {
                  if (!confirm("Position entfernen? Der Auftrag wird wieder frei.")) e.preventDefault();
                }}
              >
                ✕
              </button>
            </form>
          </td>
        </>
      )}
    </tr>
  );
}
