import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bbPost, bbGetAll } from "./bbutler";

const importsDir = fileURLToPath(new URL("../../../imports/", import.meta.url));

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(
    rows.reduce((s, r) => {
      Object.keys(r).forEach((k) => s.add(k));
      return s;
    }, new Set<string>()),
  );
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n");
}

async function dump(name: string, rows: Record<string, unknown>[]) {
  await mkdir(importsDir, { recursive: true });
  const base = `${importsDir}bb-${name}`;
  await writeFile(`${base}.json`, JSON.stringify(rows, null, 2), "utf8");
  await writeFile(`${base}.csv`, toCsv(rows), "latin1");
  return { file: `imports/bb-${name}.{json,csv}`, count: rows.length };
}

/** Kontenrahmen (Sachkonten / SKR03). */
export async function bbAccounts() {
  // Zwei Endpunkte liefern Konten; wir versuchen beide und nehmen den, der Daten hat.
  let rows: Record<string, unknown>[] = [];
  let via = "settings/get/postingaccounts";
  try {
    rows = await bbGetAll("settings/get/postingaccounts");
  } catch {
    /* fällt unten auf accounts/get zurück */
  }
  if (!rows.length) {
    via = "accounts/get";
    rows = await bbGetAll("accounts/get");
  }
  const res = await dump("konten", rows);
  return { ...res, via, sample: rows.slice(0, 3) };
}

/** Debitoren (mit Debitorennummern). */
export async function bbDebtors() {
  const rows = await bbGetAll("settings/get/debtors");
  return { ...(await dump("debitoren", rows)), sample: rows.slice(0, 3) };
}

/** Kreditoren. */
export async function bbCreditors() {
  const rows = await bbGetAll("settings/get/creditors");
  return { ...(await dump("kreditoren", rows)), sample: rows.slice(0, 3) };
}

/** Buchungen (für die Vorkontierungs-Lernbasis: Kreditor/Beleg → Konto). */
export async function bbPostings(opts: { from?: string; to?: string } = {}) {
  const today = new Date();
  const from = opts.from || `${today.getFullYear() - 3}-01-01`;
  const to = opts.to || today.toISOString().slice(0, 10);
  const rows = await bbGetAll("postings/get", { date_from: from, date_to: to });
  return { from, to, ...(await dump("buchungen", rows)), sample: rows.slice(0, 2) };
}

/** Verbindung testen. */
export async function bbPing() {
  const r = await bbPost("settings/get/postingaccounts", { limit: 1 });
  return { ok: r.success, rows: Array.isArray(r.data) ? r.data.length : 0, raw: r.raw };
}
