/** Freitext-Spiralfarbe (aus dem Portal geparst) -> Hex, für Farbmuster in UI und Laufzettel. */
export const SPIRAL_HEX: Record<string, string> = {
  "weiß": "#ffffff",
  weiss: "#ffffff",
  silber: "#c7ccd1",
  silver: "#c7ccd1",
  schwarz: "#1b1b1e",
  black: "#1b1b1e",
  gold: "#d4af37",
  blau: "#2f6feb",
  rot: "#c0392b",
  gruen: "#2e9e5b",
  "grün": "#2e9e5b",
};

/** Hex für eine Spiralfarbe, grau als Fallback bei unbekanntem/fehlendem Wert. */
export function spiralHex(name: string | null | undefined): string {
  return (name && SPIRAL_HEX[name.toLowerCase()]) || "#9aa1ac";
}
