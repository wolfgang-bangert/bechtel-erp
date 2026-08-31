import { supabase } from "./supabase";
import { pagedSelect } from "./db";

type Options = {
  from?: string;
  to?: string;
  dryRun?: boolean;
  maxPercent?: number; // Anteil vom Brutto, bis zu dem eine Differenz als Skonto gilt
  maxAbs?: number; // absolute Obergrenze je Beleg
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Bucht Skonto-Restbeträge aus: wo eine Zahlung knapp unter dem Rechnungsbetrag
 * liegt, wird die Differenz als Skonto erfasst (skonto_amount) und der Posten
 * damit geschlossen. Kreditoren (erhaltenes) und Debitoren (gewährtes) Skonto.
 */
export async function skontoApply(opts: Options = {}) {
  const { from, to, dryRun = false, maxPercent = 0.03, maxAbs = 300 } = opts;
  const inRange = (d: string | null) => (!from || !d || d >= from) && (!to || !d || d <= to);

  // --- Kreditoren -----------------------------------------------------------
  const incMatches = await pagedSelect<{ incoming_document_id: string | null; amount: number }>(
    "bank_transaction_match",
    "incoming_document_id, amount",
  );
  const paidByDoc = new Map<string, number>();
  for (const m of incMatches) {
    if (!m.incoming_document_id) continue;
    paidByDoc.set(
      m.incoming_document_id,
      r2((paidByDoc.get(m.incoming_document_id) ?? 0) + Math.abs(m.amount)),
    );
  }
  const incDocs = await pagedSelect<{
    id: string;
    doc_number: string | null;
    doc_date: string | null;
    gross_amount: number | null;
    discount_amount: number | null;
    discount_percent: number | null;
    payment_status: string;
    skonto_amount: number;
  }>(
    "incoming_document",
    "id, doc_number, doc_date, gross_amount, discount_amount, discount_percent, payment_status, skonto_amount",
    ["payment_status", "open"],
  );

  const incHits: { id: string; gap: number; label: string }[] = [];
  for (const d of incDocs) {
    if (!inRange(d.doc_date)) continue;
    const paid = paidByDoc.get(d.id) ?? 0;
    if (paid <= 0.005) continue; // keine Zahlung -> kein Skonto
    const gross = r2(d.gross_amount ?? 0);
    const gap = r2(gross - paid - (d.skonto_amount ?? 0));
    if (gap <= 0.005 || gap >= gross) continue;
    const byDisc = (d.discount_amount ?? 0) > 0 && gap <= (d.discount_amount ?? 0) + 0.5;
    const byPct =
      (d.discount_percent ?? 0) > 0 && gap <= gross * ((d.discount_percent ?? 0) / 100) + 0.5;
    const byLimit = gap <= gross * maxPercent && gap <= maxAbs;
    if (byDisc || byPct || byLimit) {
      incHits.push({ id: d.id, gap, label: `${d.doc_number ?? d.id.slice(0, 8)} · ${gap.toFixed(2)}` });
    }
  }

  // --- Debitoren ----------------------------------------------------------
  const sInv = await pagedSelect<{
    id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    gross_total: number | null;
    open_amount: number | null;
    skonto_amount: number;
    payment_status: string;
  }>(
    "sales_invoice",
    "id, invoice_number, invoice_date, gross_total, open_amount, skonto_amount, payment_status",
    ["payment_status", "partly_paid"],
  );
  const salesHits: { id: string; gap: number; label: string }[] = [];
  for (const s of sInv) {
    if (!inRange(s.invoice_date)) continue;
    const gross = r2(s.gross_total ?? 0);
    const gap = r2(s.open_amount ?? 0);
    if (gap <= 0.005 || gross <= 0) continue;
    if (gap <= gross * maxPercent && gap <= maxAbs) {
      salesHits.push({
        id: s.id,
        gap: r2((s.skonto_amount ?? 0) + gap),
        label: `${s.invoice_number ?? s.id.slice(0, 8)} · ${gap.toFixed(2)}`,
      });
    }
  }

  if (!dryRun) {
    for (const h of incHits)
      await supabase.from("incoming_document").update({ skonto_amount: h.gap }).eq("id", h.id);
    for (const h of salesHits)
      await supabase.from("sales_invoice").update({ skonto_amount: h.gap }).eq("id", h.id);
  }

  return {
    dryRun,
    kreditoren: {
      count: incHits.length,
      summe: r2(incHits.reduce((s, h) => s + h.gap, 0)),
      beispiele: incHits.slice(0, 8).map((h) => h.label),
    },
    debitoren: {
      count: salesHits.length,
      summe: r2(salesHits.reduce((s, h) => s + h.gap, 0)),
      beispiele: salesHits.slice(0, 8).map((h) => h.label),
    },
  };
}
