"use client";

/** Klappt alle Gruppen-Ebenen (Durchmesser/Loops/Farbe) der Binden-Ansicht zu. */
export function AlleZuklappenButton() {
  return (
    <button
      type="button"
      className="ghost"
      style={{ padding: "6px 12px" }}
      onClick={() => {
        document.querySelectorAll<HTMLDetailsElement>("details.gd").forEach((d) => {
          d.open = false;
        });
      }}
    >
      Alle zuklappen
    </button>
  );
}
