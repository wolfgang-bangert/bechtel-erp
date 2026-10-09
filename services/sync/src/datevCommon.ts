import { env } from "./env";
import { buildFile as buildExtf, headerLine as extfHeader, type ExtfStamm } from "@werk/shared/datev/extf";

// Spalten/Formatierung liegen in @werk/shared/datev/extf (auch vom Lohn-Export im Web genutzt).
export { HEADER_FIELDS, N_COLS, amount, ddmm, yyyymmdd, clean, q, raw } from "@werk/shared/datev/extf";

const stamm = (): ExtfStamm => ({
  beraterNr: env.datev.beraterNr(),
  mandantenNr: env.datev.mandantenNr(),
  wjBeginnDDMM: env.datev.wjBeginnDDMM(),
  sachkontoLen: env.datev.sachkontoLen(),
});

/** Metadaten-Kopfzeile des Buchungsstapels. */
export function headerLine(from: string, to: string, bezeichnung: string): string {
  return extfHeader(stamm(), from, to, bezeichnung);
}

export function buildFile(dataLines: string[], from: string, to: string, bezeichnung: string): Buffer {
  return buildExtf(stamm(), dataLines, from, to, bezeichnung);
}
