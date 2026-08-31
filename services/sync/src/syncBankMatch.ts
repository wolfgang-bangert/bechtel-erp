import { supabase } from "./supabase";
import { chunk, pagedSelect } from "./db";

type Options = { dryRun?: boolean };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tokens aus dem Verwendungszweck, die eine Rechnungsnummer sein könnten. */
export function candidateTokens(purpose: string): string[] {
  const t = new Set<string>();
  const add = (s: string) => {
    const c = s.trim();
    if (c.length < 4) return;
    t.add(c);
    t.add(c.replace(/[^A-Za-z0-9]/g, ""));
    t.add(c.replace(/^[A-Za-z]+[- ]?/i, "").replace(/[^A-Za-z0-9]/g, ""));
  };
  for (const m of purpose.matchAll(/\d{5,12}/g)) add(m[0]);
  for (const m of purpose.matchAll(/\b\d{2}[A-Za-z]{1,4}\d{2,8}\b/g)) add(m[0]);
  for (const m of purpose.matchAll(/\b[A-Za-z]{1,5}[- /]?\d[\dA-Za-z-]{3,12}\b/g)) add(m[0]);
  return [...t];
}

export async function syncBankMatch(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();

  const invoices = await pagedSelect<{
    id: string;
    invoice_number: string | null;
    open_amount: number | null;
    kind: string;
  }>("sales_invoice", "id, invoice_number, open_amount, kind");
  const byNumber = new Map<string, { id: string; open: number }>();
  for (const inv of invoices) {
    if (!inv.invoice_number || inv.kind !== "invoice") continue;
    const open = round2(inv.open_amount ?? 0);
    if (open <= 0.005) continue;
    const rec = { id: inv.id, open };
    byNumber.set(inv.invoice_number.trim(), rec);
    byNumber.set(inv.invoice_number.replace(/[^A-Za-z0-9]/g, ""), rec);
  }

  const txns = await pagedSelect<{ id: string; amount: number; purpose: string | null }>(
    "bank_transaction",
    "id, amount, purpose",
    ["match_status", "unmatched"],
  );

  type M = { bank_transaction_id: string; sales_invoice_id: string; amount: number; auto: boolean };
  const matches: M[] = [];
  const matchedTxn = new Set<string>();
  const partialTxn = new Set<string>();
  const used = new Set<string>(); // schon zugeordnete Rechnungen in diesem Lauf
  const stats = { exact: 0, skonto: 0, sammel: 0, suggestion: 0 };

  const withinSkonto = (paid: number, open: number) =>
    paid <= open + 0.02 && paid >= open * 0.955; // bis ~4,5 % (3 % Skonto + Rundung)

  for (const tx of txns) {
    if (tx.amount <= 0 || !tx.purpose) continue;
    const cands: { id: string; open: number }[] = [];
    const seenIds = new Set<string>();
    for (const tok of candidateTokens(tx.purpose)) {
      const c = byNumber.get(tok);
      if (c && !used.has(c.id) && !seenIds.has(c.id)) {
        cands.push(c);
        seenIds.add(c.id);
      }
    }
    if (cands.length === 0) continue;

    // 1 Kandidat, exakt
    if (cands.length === 1 && Math.abs(tx.amount - cands[0].open) < 0.02) {
      matches.push({ bank_transaction_id: tx.id, sales_invoice_id: cands[0].id, amount: round2(cands[0].open), auto: true });
      matchedTxn.add(tx.id);
      used.add(cands[0].id);
      stats.exact += 1;
      continue;
    }
    // 1 Kandidat, mit Skonto
    if (cands.length === 1 && withinSkonto(tx.amount, cands[0].open)) {
      matches.push({ bank_transaction_id: tx.id, sales_invoice_id: cands[0].id, amount: round2(tx.amount), auto: true });
      matchedTxn.add(tx.id);
      used.add(cands[0].id);
      stats.skonto += 1;
      continue;
    }
    // mehrere Kandidaten: Summe passt (Sammelzahlung), ggf. mit Skonto
    if (cands.length > 1) {
      const sum = round2(cands.reduce((s, c) => s + c.open, 0));
      if (Math.abs(tx.amount - sum) < 0.02 || withinSkonto(tx.amount, sum)) {
        const factor = tx.amount / sum;
        cands.forEach((c) => {
          matches.push({
            bank_transaction_id: tx.id,
            sales_invoice_id: c.id,
            amount: round2(c.open * factor),
            auto: true,
          });
          used.add(c.id);
        });
        matchedTxn.add(tx.id);
        stats.sammel += 1;
        continue;
      }
    }
    stats.suggestion += 1;
  }

  if (dryRun) {
    return { unmatched: txns.length, ...stats, matches: matches.length, dryRun };
  }

  for (const part of chunk(matches, 200)) {
    const { error } = await supabase.from("bank_transaction_match").insert(part);
    if (error) throw new Error(`bank_transaction_match: ${error.message}`);
  }
  for (const part of chunk([...matchedTxn], 200)) {
    await supabase.from("bank_transaction").update({ match_status: "matched" }).in("id", part);
  }
  for (const part of chunk([...partialTxn], 200)) {
    await supabase.from("bank_transaction").update({ match_status: "partial" }).in("id", part);
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

  return { unmatched: txns.length, ...stats, matches: matches.length, dryRun };
}
