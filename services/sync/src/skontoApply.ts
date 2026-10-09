import { supabase } from "./supabase";
import { pagedSelect } from "./db";

type Options = {
  from?: string;
  to?: string;
  dryRun?: boolean;
  maxPercent?: number; // Anteil vom Brutto, bis zu dem eine Differenz als Skonto gilt
  maxAbs?: number; // absolute Obergrenze je Beleg
  /** nur eine Seite bearbeiten (sonst beide): Eingangsrechnungen (kreditoren) oder Ausgangsrechnungen (debitoren) */
  seite?: "kreditoren" | "debitoren";
  /** nur Ausgangsrechnungen von Kunden, deren Name diesen Text enthält (z.B. "Festool") */
  kunde?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * SKR03-Automatikkonten für Skonto - feste 19%/7%-Konten bevorzugt (wie bei
 * den Erlöskonten, kein BU-Schlüssel nötig), das "wählbare" Konto (8730/3730)
 * nur als Fallback für einen Satz, der weder 19 noch 7 ist.
 */
function skontoKonto(seite: "gewaehrt" | "erhalten", rate: number): string {
  if (Math.abs(rate - 19) < 0.5) return seite === "gewaehrt" ? "8736" : "3736";
  if (Math.abs(rate - 7) < 0.5) return seite === "gewaehrt" ? "8731" : "3731";
  return seite === "gewaehrt" ? "8730" : "3730";
}

/**
 * bank_transaction.match_status nach einer neuen Zuordnung neu ableiten.
 * Die gerade eingefügte Skonto-Zeile (ledger_account + Beleg-Link auf
 * derselben Zeile) ist kein zusätzliches Bankguthaben - sie schließt die
 * Rechnung nur über den schon vorhandenen vollen Zahlungs-Match hinweg und
 * darf hier nicht mitgezählt werden, sonst gilt der Umsatz um genau den
 * Skontobetrag überallokiert.
 */
async function refreshTxStatus(txId: string) {
  const { data: tx } = await supabase.from("bank_transaction").select("amount").eq("id", txId).maybeSingle();
  if (!tx) return;
  const { data: matches } = await supabase
    .from("bank_transaction_match")
    .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const allocated = r2(
    (matches ?? [])
      .filter((m) => !(m.ledger_account && (m.sales_invoice_id || m.incoming_document_id)))
      .reduce((s, m) => s + Math.abs(m.amount ?? 0), 0),
  );
  const status = allocated + 0.005 >= Math.abs(tx.amount) ? "matched" : "partial";
  await supabase.from("bank_transaction").update({ match_status: status }).eq("id", txId);
}

/**
 * Bucht Skonto-Restbeträge aus: wo eine Zahlung knapp unter dem
 * Rechnungsbetrag liegt, wird die Differenz als eigene Buchungszeile
 * (bank_transaction_match mit ledger_account = Skontokonto UND weiterhin
 * dem Rechnungsbezug, damit die Rechnung dadurch als beglichen gilt) auf
 * der Bankzeile erfasst, an der die Zahlung hing. Kreditoren (erhaltenes,
 * 3730/3731/3736) und Debitoren (gewährtes, 8730/8731/8736) Skonto.
 */
export async function skontoApply(opts: Options = {}) {
  const { from, to, dryRun = false, maxPercent = 0.03, maxAbs = 300, seite, kunde } = opts;
  const inRange = (d: string | null) => (!from || !d || d >= from) && (!to || !d || d <= to);

  type BelegMatch = { id: string; bank_transaction_id: string; amount: number; created_at: string };

  // --- Kreditoren (erhaltenes Skonto) ----------------------------------------
  const incMatches = await pagedSelect<{
    incoming_document_id: string | null;
    id: string;
    bank_transaction_id: string;
    amount: number;
    created_at: string;
  }>("bank_transaction_match", "incoming_document_id, id, bank_transaction_id, amount, created_at");
  const byIncDoc = new Map<string, BelegMatch[]>();
  for (const m of incMatches) {
    if (!m.incoming_document_id) continue;
    const arr = byIncDoc.get(m.incoming_document_id) ?? [];
    arr.push(m);
    byIncDoc.set(m.incoming_document_id, arr);
  }
  const incDocs = await pagedSelect<{
    id: string;
    doc_number: string | null;
    doc_date: string | null;
    gross_amount: number | null;
    net_amount: number | null;
    tax_amount: number | null;
    discount_amount: number | null;
    discount_percent: number | null;
    payment_status: string;
  }>(
    "incoming_document",
    "id, doc_number, doc_date, gross_amount, net_amount, tax_amount, discount_amount, discount_percent, payment_status",
    // wie auf der Debitorenseite: nur Belege mit schon erfasster Teilzahlung
    // sind Skonto-Kandidaten (payment_status jetzt 4-wertig, siehe
    // 20260929140000_incoming_paid_total.sql).
    ["payment_status", "partly_paid"],
  );

  type Hit = { id: string; gap: number; rate: number; txId: string; label: string };
  const incHits: Hit[] = [];
  for (const d of seite === "debitoren" ? [] : incDocs) {
    if (!inRange(d.doc_date)) continue;
    const matches = byIncDoc.get(d.id) ?? [];
    if (!matches.length) continue; // keine Zahlung -> kein Skonto
    const paid = r2(matches.reduce((s, m) => s + Math.abs(m.amount), 0));
    if (paid <= 0.005) continue;
    const gross = r2(d.gross_amount ?? 0);
    const gap = r2(gross - paid);
    if (gap <= 0.005 || gap >= gross) continue;
    const byDisc = (d.discount_amount ?? 0) > 0 && gap <= (d.discount_amount ?? 0) + 0.5;
    const byPct =
      (d.discount_percent ?? 0) > 0 && gap <= gross * ((d.discount_percent ?? 0) / 100) + 0.5;
    // +0,01: Rundungscent einer anteilig verteilten Sammelzahlung (siehe
    // verteileSammelzahlungMitSkonto) darf den Satz knapp überschreiten.
    const byLimit = gap <= r2(gross * maxPercent) + 0.01 && gap <= maxAbs;
    if (!byDisc && !byPct && !byLimit) continue;
    const net = d.net_amount ?? 0;
    const rate = net > 0.005 ? r2(((d.tax_amount ?? 0) / net) * 100) : 19;
    const txId = [...matches].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].bank_transaction_id;
    incHits.push({ id: d.id, gap, rate, txId, label: `${d.doc_number ?? d.id.slice(0, 8)} · ${gap.toFixed(2)}` });
  }

  // --- Debitoren (gewährtes Skonto) -----------------------------------------
  const salesMatches = await pagedSelect<{
    sales_invoice_id: string | null;
    id: string;
    bank_transaction_id: string;
    amount: number;
    created_at: string;
  }>("bank_transaction_match", "sales_invoice_id, id, bank_transaction_id, amount, created_at");
  const bySalesInv = new Map<string, BelegMatch[]>();
  for (const m of salesMatches) {
    if (!m.sales_invoice_id) continue;
    const arr = bySalesInv.get(m.sales_invoice_id) ?? [];
    arr.push(m);
    bySalesInv.set(m.sales_invoice_id, arr);
  }
  const sInv = await pagedSelect<{
    id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    gross_total: number | null;
    net_total: number | null;
    tax_total: number | null;
    open_amount: number | null;
    payment_status: string;
    organization_id: string | null;
  }>(
    "sales_invoice",
    "id, invoice_number, invoice_date, gross_total, net_total, tax_total, open_amount, payment_status, organization_id",
    ["payment_status", "partly_paid"],
  );
  const kundeIds = kunde
    ? new Set(
        (await pagedSelect<{ id: string; name: string }>("organization", "id, name"))
          .filter((o) => o.name.toLowerCase().includes(kunde.toLowerCase()))
          .map((o) => o.id),
      )
    : null;
  const salesHits: Hit[] = [];
  for (const s of seite === "kreditoren" ? [] : sInv) {
    if (!inRange(s.invoice_date)) continue;
    if (kundeIds && !(s.organization_id && kundeIds.has(s.organization_id))) continue;
    const gross = r2(s.gross_total ?? 0);
    const gap = r2(s.open_amount ?? 0);
    if (gap <= 0.005 || gross <= 0) continue;
    if (gap > gross * maxPercent || gap > maxAbs) continue;
    const matches = bySalesInv.get(s.id) ?? [];
    if (!matches.length) continue; // keine Zahlung gefunden -> keine Bankzeile zum Anhängen
    const net = s.net_total ?? 0;
    const rate = net > 0.005 ? r2(((s.tax_total ?? 0) / net) * 100) : 19;
    const txId = [...matches].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].bank_transaction_id;
    salesHits.push({
      id: s.id,
      gap,
      rate,
      txId,
      label: `${s.invoice_number ?? s.id.slice(0, 8)} · ${gap.toFixed(2)}`,
    });
  }

  const fehler: string[] = [];
  if (!dryRun) {
    const txToRefresh = new Set<string>();
    for (const h of incHits) {
      const konto = skontoKonto("erhalten", h.rate);
      const net = r2(h.gap / (1 + h.rate / 100));
      const { error } = await supabase.from("bank_transaction_match").insert({
        bank_transaction_id: h.txId,
        incoming_document_id: h.id,
        ledger_account: konto,
        kind: "skonto",
        amount: h.gap,
        net_amount: net,
        tax_rate: h.rate,
        tax_amount: r2(h.gap - net),
        auto: true,
      });
      if (!error) txToRefresh.add(h.txId);
      else fehler.push(`Kreditor ${h.label}: ${error.message}`);
    }
    for (const h of salesHits) {
      const konto = skontoKonto("gewaehrt", h.rate);
      const net = r2(h.gap / (1 + h.rate / 100));
      const { error } = await supabase.from("bank_transaction_match").insert({
        bank_transaction_id: h.txId,
        sales_invoice_id: h.id,
        ledger_account: konto,
        kind: "skonto",
        amount: h.gap,
        net_amount: net,
        tax_rate: h.rate,
        tax_amount: r2(h.gap - net),
        auto: true,
      });
      if (!error) txToRefresh.add(h.txId);
      else fehler.push(`Debitor ${h.label}: ${error.message}`);
    }
    for (const txId of txToRefresh) await refreshTxStatus(txId);
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
    fehler,
  };
}
