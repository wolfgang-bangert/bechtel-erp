"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      Drucken / PDF
    </button>
  );
}
