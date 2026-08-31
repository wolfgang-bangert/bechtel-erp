import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { candidateTokens } from "./syncBankMatch";

type Options = { dryRun?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const normIban = (s: string | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();
const normName = (s: string | null) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c] as string)
    .replace(/ß/g, "ss")
    .replace(/\b(gmbh|mbh|kg|ag|co|ug|ek|e\.k\.|ohg)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

type Doc = {
  id: string;
  doc_type: string;
  doc_number: string | null;
  gross_amount: number | null;
  discount_amount: number | null;
  supplier_iban: string | null;
  payee_iban: string | null;
  supplier_organization_id: string | null;
  supplier_name: string | null;
  advice_reference: string[] | null;
  advice_debit_date: string | null;
  status: string;
  payment_status: string;
};

type Txn = {
  id: string;
  amount: number;
  booking_date: string;
  purpose: string | null;
  counterparty_name: string | null;
  counterparty_iban: string | null;
};

/**
 * Soll-Seite: ausgehende Zahlungen/Lastschriften auf dem Kontoauszug den
 * Eingangsrechnungen zuordnen und diese auf 'paid' setzen.
 * Tiers: (1) Rechnungsnummer im Verwendungszweck + Betrag,
 *        (2) Lieferant (IBAN/Name) + eindeutiger Betrag,
 *        (3) Zahlungs-/Lastschriftavis → dessen referenzierte Rechnungen.
 * Betrag = brutto oder brutto − Skonto.
 */
export async function syncBankMatchKreditor(opts: Options = {}) {
  const { dryRun = false } = opts;

  const docsAll = await pagedSelect<Doc>(
    "incoming_document",
    "id, doc_type, doc_number, gross_amount, discount_amount, supplier_iban, payee_iban, " +
      "supplier_organization_id, supplier_name, advice_reference, advice_debit_date, status, payment_status",
  );
  const orgs = await pagedSelect<{ id: string; name: string }>("organization", "id, name");
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const open = docsAll.filter(
    (d) =>
      d.payment_status === "open" &&
      ["invoice", "credit_note"].includes(d.doc_type) &&
      d.status !== "rejected" &&
      (d.gross_amount ?? 0) > 0,
  );
  const advices = docsAll.filter((d) => d.doc_type === "payment_advice");

  const byNumber = new Map<string, Doc>();
  for (const d of open) {
    if (!d.doc_number) continue;
    byNumber.set(d.doc_number.trim(), d);
    byNumber.set(d.doc_number.replace(/[^A-Za-z0-9]/g, ""), d);
  }

  const txns = await pagedSelect<Txn>(
    "bank_transaction",
    "id, amount, booking_date, purpose, counterparty_name, counterparty_iban",
    ["match_status", "unmatched"],
  );

  const amountFits = (paid: number, d: Doc) => {
    const g = r2(d.gross_amount ?? 0);
    if (Math.abs(paid - g) <= 0.02) return true;
    const net = r2(g - (d.discount_amount ?? 0));
    if ((d.discount_amount ?? 0) > 0 && Math.abs(paid - net) <= 0.02) return true;
    return paid >= g * 0.955 && paid <= g + 0.02; // bis ~4,5 % (Skonto)
  };

  type Row = { bank_transaction_id: string; incoming_document_id: string; amount: number };
  const rows: Row[] = [];
  const matchedTxn = new Set<string>();
  const usedDocs = new Set<string>();
  const stats = { number: 0, supplier: 0, advice: 0 };

  for (const tx of txns) {
    if (tx.amount >= 0) continue; // nur Abgänge
    const paid = r2(-tx.amount);
    const purpose = tx.purpose ?? "";

    // Tier 1: Rechnungsnummer im Verwendungszweck
    let hit: Doc | undefined;
    for (const tok of candidateTokens(purpose)) {
      const d = byNumber.get(tok);
      if (d && !usedDocs.has(d.id) && amountFits(paid, d)) {
        hit = d;
        break;
      }
    }
    if (hit) {
      rows.push({ bank_transaction_id: tx.id, incoming_document_id: hit.id, amount: tx.amount });
      usedDocs.add(hit.id);
      matchedTxn.add(tx.id);
      stats.number += 1;
      continue;
    }

    // Tier 2: Lieferant (IBAN oder Name) + eindeutiger Betrag
    const cpIban = normIban(tx.counterparty_iban);
    const cpName = normName(tx.counterparty_name);
    const supMatches = open.filter((d) => {
      if (usedDocs.has(d.id) || !amountFits(paid, d)) return false;
      if (cpIban && (normIban(d.supplier_iban) === cpIban || normIban(d.payee_iban) === cpIban))
        return true;
      const dn = normName(d.supplier_name) || normName(orgName.get(d.supplier_organization_id ?? "") ?? "");
      return cpName.length >= 5 && dn.length >= 5 && (dn.includes(cpName) || cpName.includes(dn));
    });
    if (supMatches.length === 1) {
      rows.push({ bank_transaction_id: tx.id, incoming_document_id: supMatches[0].id, amount: tx.amount });
      usedDocs.add(supMatches[0].id);
      matchedTxn.add(tx.id);
      stats.supplier += 1;
      continue;
    }

    // Tier 3: Zahlungsavis → dessen referenzierte Rechnungen
    const avis = advices.find((a) => {
      if (Math.abs(r2(a.gross_amount ?? 0) - paid) > 0.02) return false;
      if (a.advice_debit_date) {
        const dd = new Date(a.advice_debit_date).getTime();
        const bd = new Date(tx.booking_date).getTime();
        if (Math.abs(dd - bd) > 6 * 86400_000) return false;
      }
      return (a.advice_reference ?? []).length > 0;
    });
    if (avis) {
      const refs = new Set(
        (avis.advice_reference ?? []).flatMap((n) => [n.trim(), n.replace(/[^A-Za-z0-9]/g, "")]),
      );
      const target = open.filter((d) => {
        if (usedDocs.has(d.id) || !d.doc_number) return false;
        return refs.has(d.doc_number.trim()) || refs.has(d.doc_number.replace(/[^A-Za-z0-9]/g, ""));
      });
      const sum = r2(target.reduce((s, d) => s + (d.gross_amount ?? 0), 0));
      if (target.length && Math.abs(sum - paid) <= Math.max(0.05, paid * 0.05)) {
        for (const d of target) {
          const share = target.length === 1 ? tx.amount : -r2((d.gross_amount ?? 0));
          rows.push({ bank_transaction_id: tx.id, incoming_document_id: d.id, amount: share });
          usedDocs.add(d.id);
        }
        matchedTxn.add(tx.id);
        stats.advice += 1;
      }
    }
  }

  if (dryRun) {
    return { txns: txns.length, matches: rows.length, transactionsMatched: matchedTxn.size, stats, dryRun };
  }

  for (const row of rows) {
    const { error } = await supabase
      .from("bank_transaction_match")
      .insert({ ...row, amount: r2(row.amount), auto: true });
    if (error && !/duplicate key/.test(error.message))
      throw new Error(`bank_transaction_match: ${error.message}`);
  }
  // paid_at auf das Buchungsdatum der Zahlung setzen
  for (const tx of txns) {
    if (!matchedTxn.has(tx.id)) continue;
    const docIds = rows.filter((r) => r.bank_transaction_id === tx.id).map((r) => r.incoming_document_id);
    if (docIds.length)
      await supabase.from("incoming_document").update({ paid_at: tx.booking_date }).in("id", docIds);
    await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", tx.id);
  }

  return { txns: txns.length, matches: rows.length, transactionsMatched: matchedTxn.size, stats, dryRun };
}
