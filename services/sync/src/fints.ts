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
  const v = process.env[`FINTS_PIN_${kuerzel.toUpperCase()}`];
  if (!v || !v.trim()) throw new Error(`FINTS_PIN_${kuerzel.toUpperCase()} in .env fehlt`);
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
  return {
    iban,
    bookingDate: t.booking_date ?? new Date().toISOString().slice(0, 10),
    valueDate: t.value_date ?? null,
    amount,
    currency: t.currency ?? "EUR",
    counterpartyName: t.applicant_name ?? null,
    counterpartyIban: t.applicant_iban ?? null,
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

  const imp = await importBankEntries(all, { dryRun });

  if (!dryRun && balances.length) {
    for (const b of balances) {
      await supabase
        .from("bank_account")
        .update({
          balance: b.balance,
          balance_date: b.balance_date,
          balance_at: new Date().toISOString(),
        })
        .eq("iban", b.iban);
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
