"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Sachkonto-Auswahl als Popup statt cramped <select> - bei ~1200 SKR03-Konten
 * im Kontenrahmen ist eine Inline-Dropdown kaum nutzbar. Durchsuchbare Liste
 * (Nummer/Name), Klick auf eine Zeile wählt + schließt.
 * `name` gesetzt: rendert zusätzlich ein hidden input fürs umschließende
 * <form>; ohne `name` rein kontrolliert.
 */
export function AccountPicker({
  name,
  value,
  onChange,
  accounts,
  placeholder = "— Konto wählen —",
  title = "Sachkonto wählen",
  searchPlaceholder = "Nummer oder Name suchen…",
  emptyOptionLabel = "— kein Konto —",
}: {
  name?: string;
  value: string;
  onChange: (v: string) => void;
  accounts: { value: string; label: string }[];
  placeholder?: string;
  title?: string;
  searchPlaceholder?: string;
  emptyOptionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
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

  const current = accounts.find((a) => a.value === value);
  const needle = q.trim().toLowerCase();
  const filtered = needle ? accounts.filter((a) => a.label.toLowerCase().includes(needle)) : accounts;
  const shown = filtered.slice(0, 300);

  const rowStyle = (selected: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "6px 10px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    background: selected ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
    color: "var(--text)",
    font: "inherit",
  });

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        className="ghost"
        onClick={() => setOpen(true)}
        style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px" }}
      >
        {current ? current.label : value ? `${value} (nicht im Kontenrahmen)` : placeholder}
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
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                width: "min(560px, 96vw)",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
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
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ overflow: "auto", padding: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  style={rowStyle(!value)}
                >
                  {emptyOptionLabel}
                </button>
                {shown.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => {
                      onChange(a.value);
                      setOpen(false);
                    }}
                    style={rowStyle(a.value === value)}
                  >
                    {a.label}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="count" style={{ padding: 8 }}>
                    Keine Treffer.
                  </p>
                )}
                {filtered.length > shown.length && (
                  <p className="count" style={{ padding: 8 }}>
                    {filtered.length - shown.length} weitere Treffer — Suche eingrenzen…
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
