import { readFileSync } from "node:fs";
import { supabase } from "./supabase";
import { chunk } from "./db";
import { parseCamt053, type CamtEntry } from "./camt";

type Options = { file: string; dryRun?: boolean };

const normIban = (s: string) => s.replace(/\s+/g, "").toUpperCase();

async function ensureBankAccount(iban: string): Promise<string> {
  const { data: found } = await supabase
    .from("bank_account")
    .select("id")
    .eq("iban", iban)
    .maybeSingle();
  if (found) return found.id;
  const { data, error } = await supabase
    .from("bank_account")
    .insert({ iban, label: `Konto ${iban.slice(-4)}` })
    .select("id")
    .single();
  if (error) throw new Error(`bank_account anlegen: ${error.message}`);
  return (data as { id: string }).id;
}

export async function syncBankImport(opts: Options) {
  const { file, dryRun = false } = opts;
  const xml = readFileSync(file, "utf8");
  const entries: CamtEntry[] = parseCamt053(xml);
  if (entries.length === 0) return { entries: 0, imported: 0, duplicates: 0, dryRun };

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

  for (const iban of ibans) byIban.set(iban, await ensureBankAccount(iban));

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
