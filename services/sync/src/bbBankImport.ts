import { createHash } from "node:crypto";
import { bbGetAll } from "./bbutler";
import { supabase } from "./supabase";
import { importBankEntries } from "./syncBankImport";
import type { CamtEntry } from "./camt";

/* --------------------------------------------------------------------------
 * Bankumsätze aus BuchhaltungsButler nachholen (FinTS liefert nur die letzten Wochen). Je Bankkonto
 * (BB-Sachkonto 12xx) werden die Umsätze von Jahresbeginn bis zum Tag VOR dem ersten in werk vorhandenen
 * Umsatz geholt und mit denselben Regeln wie bei CAMT/FinTS importiert (Dedup über dedup_key).
 * BB liefert keine Gegenkonto-IBAN und keine End-to-End-ID - bank:match arbeitet dann über Betrag,
 * Namen und Verwendungszweck.
 * -------------------------------------------------------------------------- */

const KONTEN: { bb: string; iban: string; label: string }[] = [
  { bb: "1230", iban: "DE36610500000016031702", label: "Kreissparkasse Göppingen" },
  { bb: "1210", iban: "DE97600501010002591799", label: "BW-Bank" },
  { bb: "1220", iban: "DE71610605000408608005", label: "Volksbank Göppingen" },
  { bb: "1260", iban: "DE30701207001801110667", label: "Oberbank" },
];

type BbTx = {
  id_by_customer: number;
  to_from: string | null;
  amount: string;
  booking_date: string;
  value_date: string | null;
  purpose: string | null;
};

const day = (s: string | null) => (s ? s.slice(0, 10) : null);
const prevDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);

export async function bbBankImport({ dryRun, from = "2026-01-01" }: { dryRun: boolean; from?: string }) {
  const out: Record<string, unknown> = { dryRun, konten: [] as unknown[] };
  for (const k of KONTEN) {
    const { data: acc } = await supabase.from("bank_account").select("id").eq("iban", k.iban).maybeSingle();
    let bis = new Date().toISOString().slice(0, 10);
    if (acc) {
      const { data: first } = await supabase
        .from("bank_transaction")
        .select("booking_date")
        .eq("bank_account_id", acc.id)
        .order("booking_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first?.booking_date) bis = prevDay(first.booking_date);
    }
    const rows = await bbGetAll<BbTx>("transactions/get", { account: k.bb, date_from: from, date_to: bis }, 200);
    const entries: CamtEntry[] = rows
      .filter((r) => day(r.booking_date) && Number.isFinite(Number(r.amount)))
      .map((r) => ({
        iban: k.iban,
        bookingDate: day(r.booking_date)!,
        valueDate: day(r.value_date),
        amount: Number(r.amount),
        currency: "EUR",
        counterpartyName: r.to_from?.trim() || null,
        counterpartyIban: null,
        purpose: r.purpose?.trim() || null,
        endToEndId: null,
        bankRef: `bb:${r.id_by_customer}`,
        dedupKey: `bb:tx:${createHash("sha1").update(`${k.iban}|${r.id_by_customer}`).digest("hex")}`,
      }));
    const res = await importBankEntries(entries, { dryRun, bankNames: {} });
    (out.konten as unknown[]).push({ konto: k.label, bbKonto: k.bb, zeitraum: `${from} bis ${bis}`, ausBB: rows.length, ...res });
  }
  return out;
}
