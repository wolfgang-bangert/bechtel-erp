import { registerMm } from "./register";

/**
 * Rand-Kennung für eine Kapitel-PDF: SPRACHE_KAPITELNR_HÖHE, z.B.
 * "IT_4-11_29.7" - hilft beim Drucken/Stanzen bei flux, Sprache, Kapitel
 * und Register-Höhe je Datei zu erkennen. Höhe kommt aus der
 * Register-Position des zugehörigen Unterregisters (registerMm()).
 */
export function kapitelKennung(
  sprache: string | null,
  kapitelNr: string,
  registerPosition: number | null,
  registerTeile: number | null,
): string {
  const hoehe = registerPosition != null ? registerMm(registerPosition, 297, registerTeile ?? 10) : null;
  return `${(sprache ?? "").toUpperCase()}_${kapitelNr}_${hoehe != null ? hoehe.toFixed(1) : "?"}`;
}
