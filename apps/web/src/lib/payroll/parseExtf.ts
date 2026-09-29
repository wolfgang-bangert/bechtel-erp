/**
 * Parser für den monatlichen DATEV-EXTF-Buchungsstapel des Lohnabrechners
 * (Windows-1252/ISO-8859-1, Semikolon, Anführungszeichen) - liest per
 * Spaltenname aus Zeile 2 statt fixer Positionen (robuster gegenüber
 * kleineren Format-Varianten zwischen Lohnabrechnern).
 */

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

const strip = (s: string | undefined) => (s ?? "").trim();
const parseAmount = (s: string) => Number(strip(s).replace(/\./g, "").replace(",", "."));

function yyyymmddToIso(s: string): string | null {
  const t = strip(s);
  if (!/^\d{8}$/.test(t)) return null;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
}

function ddmmToIso(s: string, year: number): string | null {
  const t = strip(s);
  if (!/^\d{4}$/.test(t)) return null;
  return `${year}-${t.slice(2, 4)}-${t.slice(0, 2)}`;
}

export type PayrollBookingRow = {
  position: number;
  amount: number;
  soll_haben: "S" | "H";
  konto: string;
  gegenkonto: string;
  bu_schluessel: string | null;
  beleg_datum: string | null;
  belegfeld1: string | null;
  belegfeld2: string | null;
  buchungstext: string | null;
  kost1: string | null;
  kost2: string | null;
  raw: Record<string, string>;
};

export type PayrollImportMeta = {
  mandantenNr: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export function parsePayrollExtf(buf: Buffer): { meta: PayrollImportMeta; rows: PayrollBookingRow[] } {
  const text = buf.toString("latin1");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 3) throw new Error("Datei leer oder kein gültiges EXTF-Format (zu wenige Zeilen).");

  const headerLine = splitCsvLine(lines[0]);
  if (strip(headerLine[0]).replace(/"/g, "") !== "EXTF") {
    throw new Error("Keine DATEV-EXTF-Datei (Kennzeichen \"EXTF\" fehlt in Zeile 1).");
  }
  const meta: PayrollImportMeta = {
    mandantenNr: strip(headerLine[11]).replace(/"/g, "") || null,
    periodStart: yyyymmddToIso(headerLine[14] ?? ""),
    periodEnd: yyyymmddToIso(headerLine[15] ?? ""),
  };
  const year = Number((meta.periodEnd ?? meta.periodStart ?? "").slice(0, 4)) || new Date().getFullYear();

  const colHeader = splitCsvLine(lines[1]).map((h) => h.trim().toLowerCase());
  const idxEq = (name: string) => colHeader.findIndex((h) => h === name);
  const idxIncludes = (name: string) => colHeader.findIndex((h) => h.includes(name));
  const idxStarts = (name: string) => colHeader.findIndex((h) => h.startsWith(name));
  // "soll-/haben" und "bu-schl" stecken als Teilstring auch im Namen der
  // Umsatz- bzw. Gegenkonto-Spalte ("Umsatz (ohne Soll-/Haben-Kennzeichen)",
  // "Gegenkonto (ohne BU-Schlüssel)") - hier exakt matchen, nicht per includes.
  const c = {
    amount: idxStarts("umsatz"),
    sollHaben: idxEq("soll-/haben-kennzeichen"),
    konto: idxEq("konto"),
    gegenkonto: idxIncludes("gegenkonto"),
    buSchluessel: idxEq("bu-schlüssel"),
    belegdatum: idxIncludes("belegdatum"),
    belegfeld1: idxIncludes("belegfeld 1"),
    belegfeld2: idxIncludes("belegfeld 2"),
    buchungstext: idxIncludes("buchungstext"),
    kost1: idxIncludes("kost1"),
    kost2: idxIncludes("kost2"),
  };
  if (c.amount < 0 || c.sollHaben < 0 || c.konto < 0 || c.gegenkonto < 0) {
    throw new Error("Unbekanntes EXTF-Format (Spalten Umsatz/Soll-Haben/Konto/Gegenkonto fehlen).");
  }

  const rows: PayrollBookingRow[] = [];
  const dataLines = lines.slice(2);
  for (let i = 0; i < dataLines.length; i++) {
    const f = splitCsvLine(dataLines[i]);
    const amount = parseAmount(f[c.amount] ?? "");
    const sollHaben = strip(f[c.sollHaben]).replace(/"/g, "");
    const konto = strip(f[c.konto]).replace(/"/g, "");
    if (!Number.isFinite(amount) || !konto || (sollHaben !== "S" && sollHaben !== "H")) continue;

    const raw: Record<string, string> = {};
    colHeader.forEach((h, ci) => {
      if (h) raw[h] = f[ci] ?? "";
    });

    rows.push({
      position: i + 1,
      amount: Math.abs(amount),
      soll_haben: sollHaben,
      konto,
      gegenkonto: strip(f[c.gegenkonto]).replace(/"/g, ""),
      bu_schluessel: strip(f[c.buSchluessel]).replace(/"/g, "") || null,
      beleg_datum: ddmmToIso(f[c.belegdatum] ?? "", year),
      belegfeld1: strip(f[c.belegfeld1]).replace(/"/g, "") || null,
      belegfeld2: strip(f[c.belegfeld2]).replace(/"/g, "") || null,
      buchungstext: strip(f[c.buchungstext]).replace(/"/g, "") || null,
      kost1: strip(f[c.kost1]).replace(/"/g, "") || null,
      kost2: strip(f[c.kost2]).replace(/"/g, "") || null,
      raw,
    });
  }

  return { meta, rows };
}
