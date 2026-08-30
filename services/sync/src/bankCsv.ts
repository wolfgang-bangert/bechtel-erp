import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { CamtEntry } from "./camt";

/* --------------------------------------------------------------------------
 * CSV-CAMT-Export deutscher Sparkassen / Volksbanken ("Umsätze CSV").
 * Semikolon, in Anführungszeichen, ISO-8859-1, Datum DD.MM.YY, Komma-Dezimal.
 * Spalten: Auftragskonto; Buchungstag; Valutadatum; Buchungstext;
 *          Verwendungszweck; Beguenstigter/Zahlungspflichtiger; Kontonummer;
 *          BLZ; Betrag; Waehrung; Info
 * -------------------------------------------------------------------------- */

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ";") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const SEPA_RE =
  /(EREF|KREF|MREF|CRED|DEBT|COAM|OAMT|SVWZ|ABWA|ABWE|IBAN|BIC)\+/g;

/** SEPA-Feldsalat aus dem Verwendungszweck aufdröseln. */
export function parseSepaPurpose(raw: string): {
  svwz: string | null;
  eref: string | null;
} {
  const parts: { tag: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  SEPA_RE.lastIndex = 0;
  while ((m = SEPA_RE.exec(raw))) parts.push({ tag: m[1], start: m.index });
  if (parts.length === 0) return { svwz: raw.trim() || null, eref: null };
  const fields: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const from = parts[i].start + parts[i].tag.length + 1;
    const to = i + 1 < parts.length ? parts[i + 1].start : raw.length;
    fields[parts[i].tag] = raw.slice(from, to).trim();
  }
  const eref = fields.EREF && !/^NOTPROVIDED$/i.test(fields.EREF) ? fields.EREF : null;
  return { svwz: fields.SVWZ?.trim() || null, eref };
}

function ddmmyy(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (!m) return null;
  const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${yr}-${m[2]}-${m[1]}`;
}

export function parseBankCsv(
  file: string,
  opts: { includePending?: boolean } = {},
): CamtEntry[] {
  const text = readFileSync(file, "latin1");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.findIndex((h) => h.includes(name));
  const c = {
    acct: idx("auftragskonto"),
    bookg: idx("buchungstag"),
    val: idx("valuta"),
    txt: idx("buchungstext"),
    purpose: idx("verwendungszweck"),
    party: idx("beguenstigter") >= 0 ? idx("beguenstigter") : idx("zahlungspflichtiger"),
    partyAcct: idx("kontonummer") >= 0 ? idx("kontonummer") : idx("iban"),
    amount: idx("betrag"),
    ccy: idx("waehrung"),
    info: idx("info"),
  };
  if (c.acct < 0 || c.amount < 0 || c.bookg < 0) {
    throw new Error("Unbekanntes CSV-Format (Spalten Auftragskonto/Buchungstag/Betrag fehlen)");
  }

  const seen = new Map<string, number>();
  const out: CamtEntry[] = [];

  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    const info = (f[c.info] ?? "").toLowerCase();
    if (!opts.includePending && info.includes("vorgemerkt")) continue;

    const iban = (f[c.acct] ?? "").replace(/\s+/g, "").toUpperCase();
    const bookingDate = ddmmyy(f[c.bookg] ?? "");
    const valueDate = c.val >= 0 ? ddmmyy(f[c.val] ?? "") : null;
    const amount = Number((f[c.amount] ?? "").replace(/\./g, "").replace(",", "."));
    if (!iban || !bookingDate || !Number.isFinite(amount)) continue;

    const rawPurpose = (f[c.purpose] ?? "").trim();
    const { svwz, eref } = parseSepaPurpose(rawPurpose);

    const base = [
      iban, bookingDate, amount.toFixed(2), rawPurpose,
      f[c.party] ?? "", f[c.partyAcct] ?? "", eref ?? "",
    ].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    out.push({
      iban,
      bookingDate,
      valueDate,
      amount,
      currency: (f[c.ccy] ?? "EUR").trim() || "EUR",
      counterpartyName: (f[c.party] ?? "").trim() || null,
      counterpartyIban: (f[c.partyAcct] ?? "").replace(/\s+/g, "").toUpperCase() || null,
      purpose: svwz ?? rawPurpose ?? null,
      endToEndId: eref,
      bankRef: (f[c.txt] ?? "").trim() || null,
      dedupKey: "csv:" + createHash("sha1").update(`${base}#${n}`).digest("hex"),
    });
  }
  return out;
}
