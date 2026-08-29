import { supabase } from "./supabase";
import { chunk, pagedSelect } from "./db";

type Options = { dryRun?: boolean };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tokens aus dem Verwendungszweck, die eine Rechnungsnummer sein könnten. */
function candidateTokens(purpose: string): string[] {
  const t = new Set<string>();
  for (const m of purpose.matchAll(/[A-Za-z]{0,4}-?\d{2,4}[-/]?\d{2,7}/g)) {
    const raw = m[0];
    t.add(raw);
    t.add(raw.replace(/[^A-Za-z0-9]/g, ""));
    t.add(raw.replace(/^[A-Za-z]+-?/, "")); // Präfix weg
  }
  return [...t];
}

export async function syncBankMatch(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();

  // offene Rechnungen nach Nummer indizieren
  const invoices = await pagedSelect<{
    id: string;
    invoice_number: string | null;
    open_amount: number | null;
    kind: string;
  }>("sales_invoice", "id, invoice_number, open_amount, kind");
  const byNumber = new Map<string, { id: string; open: number }>();
  for (const inv of invoices) {
    if (!inv.invoice_number || inv.kind !== "invoice") continue;
    const open = inv.open_amount ?? 0;
    if (open <= 0.005) continue;
    byNumber.set(inv.invoice_number.trim(), { id: inv.id, open });
    byNumber.set(inv.invoice_number.replace(/[^A-Za-z0-9]/g, ""), { id: inv.id, open });
  }

  const txns = await pagedSelect<{
    id: string;
    amount: number;
    purpose: string | null;
  }>("bank_transaction", "id, amount, purpose", ["match_status", "unmatched"]);

  const autoMatches: { bank_transaction_id: string; sales_invoice_id: string; amount: number; auto: boolean }[] = [];
  const matchedTxn: string[] = [];
  let suggestions = 0;

  for (const tx of txns) {
    if (tx.amount <= 0 || !tx.purpose) continue;
    let hit: { id: string; open: number } | undefined;
    for (const tok of candidateTokens(tx.purpose)) {
      const cand = byNumber.get(tok);
      if (cand) {
        hit = cand;
        break;
      }
    }
    if (!hit) continue;
    if (Math.abs(tx.amount - hit.open) < 0.02) {
      autoMatches.push({
        bank_transaction_id: tx.id,
        sales_invoice_id: hit.id,
        amount: round2(Math.min(tx.amount, hit.open)),
        auto: true,
      });
      matchedTxn.push(tx.id);
      byNumber.forEach((v, k) => {
        if (v.id === hit!.id) byNumber.delete(k);
      });
    } else {
      suggestions += 1;
    }
  }

  if (dryRun) {
    return { unmatched: txns.length, autoMatch: autoMatches.length, suggestions, dryRun };
  }

  for (const part of chunk(autoMatches, 200)) {
    const { error } = await supabase.from("bank_transaction_match").insert(part);
    if (error) throw new Error(`bank_transaction_match: ${error.message}`);
  }
  for (const part of chunk(matchedTxn, 200)) {
    const { error } = await supabase
      .from("bank_transaction")
      .update({ match_status: "matched" })
      .in("id", part);
    if (error) throw new Error(`bank_transaction status: ${error.message}`);
  }

  await supabase.from("external_sync_state").upsert(
    {
      system: "bank",
      resource: "match",
      last_run_at: startedAt.toISOString(),
      last_status: "ok",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "system,resource" },
  );

  return {
    unmatched: txns.length,
    autoMatch: autoMatches.length,
    suggestions,
    dryRun,
  };
}
