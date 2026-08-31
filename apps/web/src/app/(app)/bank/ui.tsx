"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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

/** Suchfeld mit Trefferliste (Nummer / Name / Betrag), Liste per Portal ans <body>. */
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
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all.slice(0, 15);
    const terms = s.split(/\s+/);
    return all
      .filter((o) => {
        const l = o.label.toLowerCase();
        return terms.every((t) => l.includes(t));
      })
      .slice(0, 15);
  }, [q, all]);

  const place = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 320) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const h = () => place();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("scroll", h, true);
      window.removeEventListener("resize", h);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const showList = open && !picked && (results.length > 0 || all.length === 0);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: 230 }}>
      <input type="hidden" name={name} value={picked?.number ?? q} />
      <input
        value={picked ? picked.label : q}
        onChange={(e) => {
          setPicked(null);
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        autoComplete="off"
        placeholder={placeholder}
        style={{ width: "100%", ...(picked ? { borderColor: "#3a7" } : {}) }}
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
      {mounted &&
        showList &&
        rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              maxHeight: 300,
              overflowY: "auto",
              zIndex: 1000,
              background: "var(--card, #fff)",
              color: "var(--fg, #111)",
              border: "1px solid var(--border, #ccc)",
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(0,0,0,.18)",
            }}
          >
            {all.length === 0 && (
              <div style={{ padding: "7px 10px", fontSize: 13, color: "var(--muted, #888)" }}>
                keine offenen Rechnungen geladen
              </div>
            )}
            {results.map((r) => (
              <button
                key={r.number}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPicked(r);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  border: "none",
                  borderBottom: "1px solid var(--border, #eee)",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>,
          document.body,
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
