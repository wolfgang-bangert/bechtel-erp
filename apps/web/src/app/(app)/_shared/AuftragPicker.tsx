"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDate, fmtEur } from "@/lib/format";

type Hit = {
  order_number: string;
  customer: string | null;
  order_date: string | null;
  net_total: number | null;
  state: string | null;
};

// Keyline-Schreibweise: "W7MN2S" -> "W7-MN-2S".
export const fmtOrderNo = (n: string) => (/^[A-Z0-9]{6}$/.test(n) ? n.match(/../g)!.join("-") : n);

/**
 * Auftrag per Suche wählen (Auftragsnummer oder Kunde) statt Nummer abzutippen.
 * Die ~20.000 Keyline-Aufträge werden serverseitig durchsucht. Ein eingegebener Text,
 * der keinem Auftrag entspricht, kann als reine Referenz übernommen werden.
 */
export function AuftragPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/auftraege/suche?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        if (res.ok) setHits((await res.json()) as Hit[]);
      } catch {
        /* abgebrochen */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  const row: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "7px 10px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    background: "transparent",
    color: "var(--text)",
    font: "inherit",
  };

  return (
    <>
      <button
        type="button"
        className="bd-field-input"
        onClick={() => setOpen(true)}
        style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", minHeight: 38 }}
      >
        {value ? value : <span style={{ opacity: 0.6 }}>— Auftrag wählen —</span>}
      </button>
      {open &&
        createPortal(
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.55)",
              zIndex: 200,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "8vh 3vw",
              overflow: "auto",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bd-card"
              style={{ margin: 0, padding: 0, width: "min(640px, 96vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
            >
              <div
                className="toolbar"
                style={{ justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--bd-line)" }}
              >
                <strong style={{ fontFamily: "var(--font-bd-display)" }}>Auftrag wählen</strong>
                <button type="button" className="bd-btn bd-btn-secondary" onClick={() => setOpen(false)}>Schließen</button>
              </div>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd-line)" }}>
                <input
                  ref={searchRef}
                  className="bd-field-input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Auftragsnummer oder Kunde suchen…"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ overflow: "auto", padding: 6 }}>
                {value && (
                  <button type="button" style={row} onClick={() => { onChange(""); setOpen(false); }}>
                    — Zuordnung entfernen —
                  </button>
                )}
                {q.trim() && (
                  <button
                    type="button"
                    style={{ ...row, opacity: 0.8 }}
                    onClick={() => { onChange(q.trim()); setOpen(false); }}
                  >
                    „{q.trim()}“ als Referenz (Text) übernehmen
                  </button>
                )}
                {hits.map((h) => (
                  <button
                    key={h.order_number}
                    type="button"
                    style={row}
                    onClick={() => { onChange(fmtOrderNo(h.order_number)); setOpen(false); }}
                  >
                    <strong>{fmtOrderNo(h.order_number)}</strong>
                    {" · "}{h.customer ?? "–"}
                    <span style={{ opacity: 0.65 }}>
                      {" · "}{h.order_date ? fmtDate(h.order_date) : "–"}
                      {h.net_total != null ? ` · ${fmtEur(h.net_total)}` : ""}
                    </span>
                  </button>
                ))}
                {!loading && hits.length === 0 && <p className="count" style={{ padding: 8 }}>Keine Treffer.</p>}
                {loading && <p className="count" style={{ padding: 8 }}>Suche…</p>}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
