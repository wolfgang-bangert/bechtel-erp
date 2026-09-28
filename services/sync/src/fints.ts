import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { CamtEntry } from "./camt";
import { importBankEntries } from "./syncBankImport";
import { syncBankMatch } from "./syncBankMatch";
import { syncBankMatchKreditor } from "./syncBankMatchKreditor";
import { supabase } from "./supabase";

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const svc = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const PY = svc(".fints-venv/bin/python");
const SCRIPT = svc("fints/fints_op.py");

export type FintsBank = {
  kuerzel: string;
  iban: string;
  tanVerfahren: string;
  user: string;
  server: string;
  blz: string;
  customer: string; // Kundennummer, falls abweichend von der Teilnehmernummer (user)
};

export function loadFintsBanks(): FintsBank[] {
  const path = root("imports/fints.txt");
  if (!existsSync(path)) throw new Error("imports/fints.txt fehlt");
  const out: FintsBank[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const [kuerzel, iban, tanVerfahren, user, server, customer] = s.split(";").map((x) => x.trim());
    if (!kuerzel || !iban || !user || !server) continue;
    const clean = iban.replace(/\s+/g, "").toUpperCase();
    out.push({
      kuerzel,
      iban: clean,
      tanVerfahren: tanVerfahren ?? "",
      user,
      server,
      blz: clean.slice(4, 12),
      customer: customer ?? "",
    });
  }
  return out;
}

function pinFor(kuerzel: string): string {
  const k = kuerzel.toUpperCase();
  // erst exakt, dann ohne angehängte Ziffer (oberbank2 -> oberbank): mehrere
  // Konten am selben Zugang teilen sich eine PIN.
  const base = k.replace(/\d+$/, "");
  const v = process.env[`FINTS_PIN_${k}`] ?? (base !== k ? process.env[`FINTS_PIN_${base}`] : undefined);
  if (!v || !v.trim()) throw new Error(`FINTS_PIN_${k} (oder FINTS_PIN_${base}) in .env fehlt`);
  return v.trim();
}

function runOp(
  op: "setup" | "pull",
  b: FintsBank,
  extra: string[] = [],
  userOverride?: string,
): Record<string, unknown> {
  if (!existsSync(PY)) throw new Error(`FinTS-venv fehlt (${PY}). Einrichtung: siehe fints/README`);
  const args = [
    SCRIPT,
    "--op", op,
    "--blz", b.blz,
    "--server", b.server,
    "--user", userOverride?.trim() || b.user,
    ...(b.customer ? ["--customer", b.customer] : []),
    "--iban", b.iban,
    "--state", root(`imports/fints-state.${b.kuerzel}.b64`),
    ...extra,
  ];
  const res = spawnSync(PY, args, {
    env: { ...process.env, FINTS_PIN: pinFor(b.kuerzel) },
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
  });
  const lines = (res.stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(last);
  } catch {
    throw new Error(`FinTS ${op} ${b.kuerzel}: keine JSON-Antwort (exit ${res.status})`);
  }
  if (json.error) throw new Error(`FinTS ${op} ${b.kuerzel}: ${json.error}`);
  return json;
}

export function fintsSetup(kuerzel: string, userOverride?: string) {
  const bank = loadFintsBanks().find((b) => b.kuerzel === kuerzel);
  if (!bank) throw new Error(`Bank '${kuerzel}' nicht in imports/fints.txt`);
  return runOp("setup", bank, [], userOverride);
}

type PyTxn = {
  booking_date: string | null;
  value_date: string | null;
  amount: number | null;
  currency: string | null;
  purpose: string | null;
  applicant_name: string | null;
  applicant_iban: string | null;
  end_to_end_reference: string | null;
  bank_reference: string | null;
  customer_reference: string | null;
};

// Manche Banken (beobachtet u.a. bei KSK/BW-Bank-Lastschriften/-Gutschriften)
// liefern die IBAN des Gegenkontos ohne Trennzeichen direkt vor dem Namen im
// applicant_name-Feld, applicant_iban bleibt dabei leer. Vor der Anzeige/
// Speicherung rausziehen, statt "DE...Geiger GmbH" stehen zu lassen.
//
// ACHTUNG (Bugfix): eine variable Zeichenklasse {11,30} + Lookahead auf einen
// Großbuchstaben ist ein gieriges Backtracking-Muster - bei komplett
// großgeschriebenen Namen (bei Banken sehr üblich, z.B. "MUELLER GMBH")
// frisst das Backtracking echte Anfangsbuchstaben des Namens in die
// vermeintliche IBAN. Stattdessen die exakte, genormte IBAN-Gesamtlänge je
// Länderkennung (ISO 13616) verwenden - kein Backtracking möglich, kein
// Rätselraten. Unbekannte Länderkennungen werden bewusst NICHT angefasst
// (lieber die geklebte IBAN stehen lassen als Namensbuchstaben verlieren).
export const IBAN_LENGTH: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18,
  EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27, HR: 21, HU: 28,
  IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31,
  NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27,
};
const IBAN_PREFIX_RE = /^[A-Z]{2}[0-9]{2}/;
export function splitLeadingIban(name: string | null): { name: string | null; iban: string | null } {
  if (!name) return { name, iban: null };
  const prefix = name.match(IBAN_PREFIX_RE)?.[0];
  const len = prefix ? IBAN_LENGTH[prefix.slice(0, 2)] : undefined;
  if (!len || name.length <= len) return { name, iban: null };
  const candidate = name.slice(0, len);
  if (!/^[A-Z0-9]+$/.test(candidate)) return { name, iban: null };
  const rest = name.slice(len).trim();
  return rest ? { name: rest, iban: candidate } : { name, iban: null };
}

/**
 * Einmalige Korrektur für bank_transaction-Zeilen, deren counterparty_name
 * durch den Backtracking-Bug in splitLeadingIban (vor diesem Fix) am Anfang
 * beschädigt wurde ("MUELLER GMBH" -> "R GMBH"). iban+name wurden dabei nur
 * an der falschen Stelle geschnitten, keine Zeichen gingen verloren - die
 * Konkatenation beider Felder rekonstruiert den ursprünglichen String, ein
 * erneutes Splitten mit der reparierten Logik liefert den korrekten Namen.
 * Bei einer echten applicant_iban (kein geklebter Name) liefert das erneute
 * Splitten exakt dieselben Werte zurück (Idempotenz) - dort passiert nichts.
 */
export async function fixCounterpartyNames() {
  const { data: rows } = await supabase
    .from("bank_transaction")
    .select("id, counterparty_name, counterparty_iban")
    .not("counterparty_iban", "is", null)
    .not("counterparty_name", "is", null);

  let geprueft = 0;
  let korrigiert = 0;
  const beispiele: { id: string; vorher: string; nachher: string }[] = [];
  for (const r of rows ?? []) {
    geprueft++;
    const vorherName = r.counterparty_name as string;
    const vorherIban = r.counterparty_iban as string;
    const fixed = splitLeadingIban(`${vorherIban}${vorherName}`);
    if (!fixed.iban) continue; // unbekannte Länderkennung / kein IBAN-Präfix -> nicht anfassen
    if (fixed.name === vorherName && fixed.iban === vorherIban) continue;
    await supabase
      .from("bank_transaction")
      .update({ counterparty_name: fixed.name, counterparty_iban: fixed.iban })
      .eq("id", r.id);
    korrigiert++;
    if (beispiele.length < 20) {
      beispiele.push({ id: r.id, vorher: vorherName, nachher: fixed.name ?? "" });
    }
  }
  return { geprueft, korrigiert, beispiele };
}

function toCamtEntry(iban: string, t: PyTxn): CamtEntry {
  const purpose = (t.purpose ?? "").replace(/\s+/g, " ").trim() || null;
  const amount = Number(t.amount ?? 0);
  const dedupKey =
    "fints:" +
    createHash("sha1")
      .update(
        [
          iban,
          t.booking_date ?? "",
          amount.toFixed(2),
          t.end_to_end_reference ?? "",
          (purpose ?? "").slice(0, 140),
          t.applicant_iban ?? "",
          t.bank_reference ?? "",
        ].join("|"),
      )
      .digest("hex");
  const cleaned = splitLeadingIban(t.applicant_name ?? null);
  return {
    iban,
    bookingDate: t.booking_date ?? new Date().toISOString().slice(0, 10),
    valueDate: t.value_date ?? null,
    amount,
    currency: t.currency ?? "EUR",
    counterpartyName: cleaned.name,
    counterpartyIban: t.applicant_iban ?? cleaned.iban,
    purpose,
    endToEndId: t.end_to_end_reference ?? null,
    bankRef: t.bank_reference ?? t.customer_reference ?? null,
    dedupKey,
  };
}

export async function fintsPull(opts: { kuerzel?: string; days?: number; dryRun?: boolean; match?: boolean } = {}) {
  const { kuerzel, days = 30, dryRun = false, match = true } = opts;
  const banks = loadFintsBanks().filter((b) => !kuerzel || b.kuerzel === kuerzel);
  if (!banks.length) throw new Error("keine passende Bank in imports/fints.txt");

  const perBank: Record<string, unknown>[] = [];
  const all: CamtEntry[] = [];
  const balances: { iban: string; balance: number; balance_date: string | null }[] = [];
  for (const b of banks) {
    try {
      const r = runOp("pull", b, ["--days", String(days)]) as {
        transactions?: PyTxn[];
        iban?: string;
        balance?: number | null;
        balance_date?: string | null;
      };
      const iban = (r.iban as string) || b.iban;
      const entries = (r.transactions ?? []).map((t) => toCamtEntry(iban, t));
      all.push(...entries);
      if (typeof r.balance === "number") {
        balances.push({ iban, balance: r.balance, balance_date: r.balance_date ?? null });
      }
      perBank.push({
        bank: b.kuerzel,
        geholt: entries.length,
        saldo: typeof r.balance === "number" ? r.balance : null,
      });
    } catch (err) {
      perBank.push({ bank: b.kuerzel, fehler: err instanceof Error ? err.message : String(err) });
    }
  }

  // FinTS liefert keinen offiziellen Institutsnamen zurück - das eingetragene
  // Kürzel aus imports/fints.txt ist der einzige uns bekannte Anhaltspunkt für
  // bank_account.bank_name (Nutzer kann ihn auf /bank jederzeit per ✎ korrigieren).
  const bankNames = Object.fromEntries(banks.map((b) => [b.iban, b.kuerzel.toUpperCase()]));
  const imp = await importBankEntries(all, { dryRun, bankNames });

  if (!dryRun && balances.length) {
    for (const b of balances) {
      const patch = {
        balance: b.balance,
        balance_date: b.balance_date,
        balance_at: new Date().toISOString(),
      };
      const { data: upd } = await supabase
        .from("bank_account")
        .update(patch)
        .eq("iban", b.iban)
        .select("id");
      if (!upd?.length) {
        // Konto noch nicht angelegt (0 Umsätze) → mit Saldo anlegen
        await supabase
          .from("bank_account")
          .insert({ iban: b.iban, label: `Konto ${b.iban.slice(-4)}`, ...patch });
      }
    }
  }
  const importedCount = "imported" in imp ? (imp.imported ?? 0) : 0;
  let matched: unknown = null;
  if (!dryRun && match && importedCount > 0) {
    matched = {
      haben: await syncBankMatch({ dryRun: false }),
      soll: await syncBankMatchKreditor({ dryRun: false }),
    };
  }

  return { banks: perBank, ...imp, match: matched };
}
