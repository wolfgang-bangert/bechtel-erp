"use client";

/** Seite drucken bzw. im Druckdialog „Als PDF sichern“ (für den Steuerberater). */
export function Drucken() {
  return (
    <button type="button" className="ghost" onClick={() => window.print()}>
      🖨 Drucken / als PDF
    </button>
  );
}
