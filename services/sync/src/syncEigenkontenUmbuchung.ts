/**
 * Eigenkonten-Umbuchungen automatisch erkennen und verbuchen: Überträge
 * zwischen zwei eigenen Bankkonten erscheinen im Kontoauszug beidseitig mit
 * der eigenen Firma als Gegenseite (z.B. KSK -> Oberbank), exakt
 * entgegengesetztem Betrag, meist am selben oder nächsten Tag. Kein externer
 * Beleg nötig - beide Seiten werden gegen das Interimskonto 1590 verbucht
 * (wie eine manuelle Sonderbuchung, nur automatisch).
 */
import { supabase } from "./supabase";
import { pagedSelect } from "./db";

type Options = { dryRun?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
// "&" fällt in Kontoauszügen je nach Bank/SEPA-Datensatz manchmal weg
// ("Bechtel Druck GmbH & Co. KG" vs. "BECHTEL DRUCK GMBH CO. KG") - deshalb
// ersatzlos entfernen statt zu "und" zu normalisieren, sonst driften beide
// Schreibweisen auseinander.
const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const UMBUCHUNG_ACCOUNT = "1590";

export async function syncEigenkontenUmbuchungen(opts: Options = {}) {
  const { dryRun = false } = opts;

  const { data: profile } = await supabase
    .from("setting")
    .select("value")
    .eq("key", "company.profile")
    .maybeSingle();
  const companyName = (profile?.value as { name?: string } | null)?.name;
  if (!companyName) return { skipped: "kein Firmenprofil (setting company.profile) hinterlegt", pairs: 0 };
  const key = normalize(companyName);

  const { data: accounts } = await supabase.from("bank_account").select("id").neq("kind", "darlehen");
  const accountIds = new Set((accounts ?? []).map((a) => a.id));
  if (accountIds.size < 2) return { skipped: "weniger als 2 eigene Konten", pairs: 0 };

  const txns = await pagedSelect<{
    id: string;
    bank_account_id: string;
    amount: number;
    booking_date: string;
    counterparty_name: string | null;
  }>(
    "bank_transaction",
    "id, bank_account_id, amount, booking_date, counterparty_name",
    ["match_status", "unmatched"],
  );
  const candidates = txns.filter(
    (t) =>
      accountIds.has(t.bank_account_id) &&
      t.counterparty_name &&
      normalize(t.counterparty_name) === key,
  );

  const used = new Set<string>();
  const rows: { bank_transaction_id: string; ledger_account: string; amount: number; auto: boolean; note: string; kind: string }[] = [];
  let pairs = 0;
  for (const t of candidates) {
    if (used.has(t.id)) continue;
    const partner = candidates.find(
      (o) =>
        !used.has(o.id) &&
        o.id !== t.id &&
        o.bank_account_id !== t.bank_account_id &&
        r2(o.amount + t.amount) === 0 &&
        Math.abs(new Date(o.booking_date).getTime() - new Date(t.booking_date).getTime()) <= 3 * 86400_000,
    );
    if (!partner) continue;
    used.add(t.id);
    used.add(partner.id);
    for (const side of [t, partner]) {
      rows.push({
        bank_transaction_id: side.id,
        ledger_account: UMBUCHUNG_ACCOUNT,
        amount: side.amount,
        auto: true,
        kind: "umbuchung",
        note: "Eigenkonten-Umbuchung (automatisch erkannt)",
      });
    }
    pairs += 1;
  }

  if (dryRun) return { kandidaten: candidates.length, pairs, dryRun };

  for (const row of rows) {
    const { error } = await supabase.from("bank_transaction_match").insert(row);
    if (error && !/duplicate key/.test(error.message)) throw new Error(`bank_transaction_match: ${error.message}`);
  }
  const txIds = rows.map((r) => r.bank_transaction_id);
  if (txIds.length) await supabase.from("bank_transaction").update({ match_status: "matched" }).in("id", txIds);

  return { kandidaten: candidates.length, pairs, matches: rows.length, dryRun };
}
