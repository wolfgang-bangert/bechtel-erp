import { readFileSync } from "node:fs";
import { supabase } from "./supabase";
import { chunk } from "./db";
import { parseCamt053, type CamtEntry } from "./camt";
import { parseBankCsv } from "./bankCsv";

type Options = { file: string; dryRun?: boolean; includePending?: boolean };

function parseFile(file: string, includePending?: boolean): CamtEntry[] {
  const head = readFileSync(file, "latin1").slice(0, 400).trimStart();
  if (head.startsWith("<?xml") || head.includes("BkToCstmrStmt")) {
    return parseCamt053(readFileSync(file, "utf8"));
  }
  return parseBankCsv(file, { includePending });
}

const normIban = (s: string) => s.replace(/\s+/g, "").toUpperCase();

async function ensureBankAccount(iban: string, bankName?: string): Promise<string> {
  const { data: found } = await supabase
    .from("bank_account")
    .select("id, bank_name")
    .eq("iban", iban)
    .maybeSingle();
  if (found) {
    // bank_name nachtragen, falls FinTS jetzt einen Namen liefert, den wir
    // vorher noch nicht kannten (z.B. Konto wurde ursprünglich per CSV-Import
    // angelegt) - eine bereits per Hand gepflegte Bezeichnung nicht überschreiben.
    if (bankName && !found.bank_name) {
      await supabase.from("bank_account").update({ bank_name: bankName }).eq("id", found.id);
    }
    return found.id;
  }
  const { data, error } = await supabase
    .from("bank_account")
    .insert({ iban, label: `Konto ${iban.slice(-4)}`, bank_name: bankName ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`bank_account anlegen: ${error.message}`);
  return (data as { id: string }).id;
}

export async function syncBankImport(opts: Options) {
  const { file, dryRun = false, includePending = false } = opts;
  const entries: CamtEntry[] = parseFile(file, includePending);
  return importBankEntries(entries, { dryRun });
}

/** Bereits geparste Kontobewegungen dedupen und schreiben (CAMT-Datei oder FinTS).
 *  bankNames: IBAN → Bankname (z.B. das FinTS-Kürzel aus imports/fints.txt) -
 *  füllt bank_account.bank_name beim Anlegen/Nachtragen, sonst bleibt es leer
 *  und der Avatar zeigt nur "KO" (aus dem generischen Label). */
export async function importBankEntries(
  entries: CamtEntry[],
  { dryRun = false, bankNames = {} }: { dryRun?: boolean; bankNames?: Record<string, string> } = {},
) {
  if (entries.length === 0) return { entries: 0, imported: 0, duplikate: 0, dryRun };

  const ibans = [...new Set(entries.map((e) => normIban(e.iban)))];
  const byIban = new Map<string, string>();

  const batch = `camt:${new Date().toISOString()}`;
  const existing = new Set(
    (
      await supabase
        .from("bank_transaction")
        .select("dedup_key")
        .in("dedup_key", entries.map((e) => e.dedupKey))
    ).data?.map((r) => r.dedup_key as string) ?? [],
  );

  if (dryRun) {
    return {
      ibans,
      entries: entries.length,
      neu: entries.filter((e) => !existing.has(e.dedupKey)).length,
      duplikate: entries.filter((e) => existing.has(e.dedupKey)).length,
      credit: entries.filter((e) => e.amount > 0).length,
      debit: entries.filter((e) => e.amount < 0).length,
      dryRun,
    };
  }

  for (const iban of ibans) byIban.set(iban, await ensureBankAccount(iban, bankNames[iban]));

  const rows = entries
    .filter((e) => !existing.has(e.dedupKey))
    .map((e) => ({
      bank_account_id: byIban.get(normIban(e.iban))!,
      booking_date: e.bookingDate,
      value_date: e.valueDate,
      amount: e.amount,
      currency: e.currency,
      counterparty_name: e.counterpartyName,
      counterparty_iban: e.counterpartyIban,
      purpose: e.purpose,
      end_to_end_id: e.endToEndId,
      bank_ref: e.bankRef,
      import_batch: batch,
      dedup_key: e.dedupKey,
      raw: e,
    }));

  let imported = 0;
  for (const part of chunk(rows, 300)) {
    const { error } = await supabase.from("bank_transaction").insert(part);
    if (error) throw new Error(`bank_transaction insert: ${error.message}`);
    imported += part.length;
  }

  await supabase.from("external_sync_state").upsert(
    {
      system: "bank",
      resource: "camt_import",
      last_run_at: new Date().toISOString(),
      last_status: "ok",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "system,resource" },
  );

  return { ibans, entries: entries.length, imported, duplikate: entries.length - imported, dryRun };
}
