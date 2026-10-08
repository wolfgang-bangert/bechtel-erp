/** Kategorien der Dokumentablage (Tabelle dokument, Check-Constraint in 20261008170000_dokument.sql). */
export const DOKUMENT_KATEGORIEN = {
  rapport: "Handwerker-Rapport",
  lieferschein: "Lieferschein",
  vertrag: "Vertrag",
  sonstiges: "Sonstiges",
} as const;

export type DokumentKategorie = keyof typeof DOKUMENT_KATEGORIEN;

export const istDokumentKategorie = (k: string): k is DokumentKategorie => k in DOKUMENT_KATEGORIEN;
