"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, fmtEur } from "@/lib/format";
import { ordneBankzeileZu } from "../actions";

export type BankKandidat = {
  id: string;
  booking_date: string;
  amount: number;
  frei: number;
  counterparty_name: string | null;
  purpose: string | null;
  passt: boolean;
};

/** Offene Bankzeilen zur Auswahl, um sie dem Beleg zuzuordnen (Bankzuordnung am Eingangsbeleg). */
export function BankZuordnen({ docId, kandidaten }: { docId: string; kandidaten: BankKandidat[] }) {
  const router = useRouter();
  const [tx, setTx] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (!kandidaten.length)
    return <div className="bd-hint" style={{ marginTop: 6 }}>Keine passende offene Bankzeile gefunden.</div>;
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <select className="bd-field-input" style={{ maxWidth: 560 }} value={tx} onChange={(e) => setTx(e.target.value)}>
        <option value="">Bankzeile zuordnen …</option>
        {kandidaten.map((k) => (
          <option key={k.id} value={k.id}>
            {k.passt ? "★ " : ""}
            {fmtDate(k.booking_date)} · {fmtEur(Math.abs(k.frei))} · {k.counterparty_name ?? "–"}
            {k.purpose ? ` · ${k.purpose.slice(0, 40)}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="bd-btn bd-btn-secondary"
        disabled={!tx || pending}
        onClick={() =>
          start(async () => {
            const r = await ordneBankzeileZu(docId, tx);
            setMsg(r.error ?? "");
            if (r.ok) {
              setTx("");
              router.refresh();
            }
          })
        }
      >
        zuordnen
      </button>
      {msg && <span style={{ color: "#b3261e", fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
