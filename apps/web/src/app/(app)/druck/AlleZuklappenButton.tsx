"use client";

/** Klappt alle Gruppen-Ebenen (Durchmesser/Loops/Farbe) der Binden-Ansicht zu. */
export function AlleZuklappenButton() {
  return (
    <button
      type="button"
      className="bd-btn bd-btn-secondary bd-btn-sm"
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
