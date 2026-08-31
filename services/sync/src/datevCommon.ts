import { env } from "./env";

/** Spalten des EXTF-Buchungsstapels (Format 700, Version 13). */
export const HEADER_FIELDS = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs",
  "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto",
  "Buchungstext", "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank",
  "Sachverhalt", "Zinssperre", "Beleglink",
  "Beleginfo - Art 1", "Beleginfo - Inhalt 1", "Beleginfo - Art 2", "Beleginfo - Inhalt 2",
  "Beleginfo - Art 3", "Beleginfo - Inhalt 3", "Beleginfo - Art 4", "Beleginfo - Inhalt 4",
  "Beleginfo - Art 5", "Beleginfo - Inhalt 5", "Beleginfo - Art 6", "Beleginfo - Inhalt 6",
  "Beleginfo - Art 7", "Beleginfo - Inhalt 7", "Beleginfo - Art 8", "Beleginfo - Inhalt 8",
  "KOST1 - Kostenstelle", "KOST2 - Kostenstelle", "Kost-Menge",
  "EU-Land u. UStID (Bestimmung)", "EU-Steuersatz (Bestimmung)",
];
export const N_COLS = HEADER_FIELDS.length;

export const amount = (n: number) => Math.abs(n).toFixed(2).replace(".", ",");
export const ddmm = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}`;
export const yyyymmdd = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
export const clean = (s: string, max: number) =>
  s.replace(/[";\r\n]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
/** DATEV: Text in Anführungszeichen, Zahlen/Datum ohne, Leeres bleibt leer. */
export const q = (v: string) => (v === "" ? "" : `"${v.replace(/"/g, '""')}"`);
export const raw = (v: string | number) => String(v);

/** Metadaten-Kopfzeile des Buchungsstapels. */
export function headerLine(from: string, to: string, bezeichnung: string): string {
  const now = new Date();
  const ts =
    now.toISOString().replace(/[-:T]/g, "").slice(0, 14) +
    String(now.getMilliseconds()).padStart(3, "0");
  const wjBeginn = `${from.slice(0, 4)}${env.datev.wjBeginnDDMM()}`;
  return [
    q("EXTF"), "700", "21", q("Buchungsstapel"), "13", raw(ts),
    "", "", "", "",
    raw(env.datev.beraterNr()), raw(env.datev.mandantenNr()),
    raw(wjBeginn), raw(env.datev.sachkontoLen()),
    raw(yyyymmdd(from)), raw(yyyymmdd(to)),
    q(bezeichnung), "", "1", "0", "0", q("EUR"),
    "", "", "", "0", "", "", "", "", "",
  ].join(";");
}

export function buildFile(dataLines: string[], from: string, to: string, bezeichnung: string): Buffer {
  const content =
    headerLine(from, to, bezeichnung) +
    "\r\n" +
    HEADER_FIELDS.join(";") +
    "\r\n" +
    dataLines.join("\r\n") +
    (dataLines.length ? "\r\n" : "");
  return Buffer.from(content, "latin1");
}
