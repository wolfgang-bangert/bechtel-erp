"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useActionState } from "react";
import { matchTransaction, type MatchState } from "./actions";

const empty: MatchState = {};

export type Candidate = { number: string; label: string };

const Ctx = createContext<{ ar: Candidate[]; er: Candidate[] }>({ ar: [], er: [] });

export function CandidateProvider({
  ar,
  er,
  children,
}: {
  ar: Candidate[];
  er: Candidate[];
  children: ReactNode;
}) {
  const value = useMemo(() => ({ ar, er }), [ar, er]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Text-Suchfeld mit gefilterter Trefferliste (Nummer ODER Name ODER Betrag). */
function InvoiceCombo({
  name,
  side,
  defaultNumber,
  placeholder,
}: {
  name: string;
  side: "debitor" | "kreditor";
  defaultNumber?: string;
  placeholder?: string;
}) {
  const all = useContext(Ctx)[side === "kreditor" ? "er" : "ar"];
  const [picked, setPicked] = useState<Candidate | null>(
    defaultNumber ? all.find((o) => o.number === defaultNumber) ?? null : null,
  );
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return all.filter((o) => o.label.toLowerCase().includes(s)).slice(0, 12);
  }, [q, all]);

  return (
    <div style={{ position: "relative", width: 320 }}>
      <input type="hidden" name={name} value={picked?.number ?? q} />
      <input
        value={picked ? picked.label : q}
        onChange={(e) => {
          setPicked(null);
          setQ(e.target.value);
        }}
        autoComplete="off"
        placeholder={placeholder}
        style={{
          width: "100%",
          ...(picked ? { borderColor: "var(--ok, #3a7)" } : {}),
        }}
      />
      {picked && (
        <button
          type="button"
          onClick={() => {
            setPicked(null);
            setQ("");
          }}
          className="ghost"
          style={{ position: "absolute", right: 2, top: 2, padding: "0 8px" }}
        >
          ×
        </button>
      )}
      {!picked && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            background: "var(--card, #fff)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 6px 20px rgba(0,0,0,.15)",
          }}
        >
          {results.map((r) => (
            <button
              key={r.number}
              type="button"
              onClick={() => setPicked(r)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchForm({
  txId,
  side = "debitor",
  defaultNumber,
  hint,
}: {
  txId: string;
  side?: "debitor" | "kreditor";
  defaultNumber?: string;
  hint?: string;
}) {
  const [state, action, pending] = useActionState(matchTransaction, empty);

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="side" value={side} />
      <InvoiceCombo
        name="invoice_number_manual"
        side={side}
        defaultNumber={defaultNumber}
        placeholder={hint ?? (side === "kreditor" ? "ER-Nr. / Lieferant …" : "Rg-Nr. / Kunde …")}
      />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "zuordnen"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
