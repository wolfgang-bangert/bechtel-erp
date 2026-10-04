import { supabase } from "./supabase";
import { pagedSelect, setSyncState } from "./db";
import {
  berechneRechnungsBuchungszeilen,
  type ErloesKontenMap,
  type RechnungsPosition,
} from "@werk/shared/buchhaltung/erloeskonten";

type Options = { dryRun?: boolean };

async function loadRevenueAccounts(): Promise<ErloesKontenMap> {
  const map = (
    (await pagedSelect<{ key: string; value: ErloesKontenMap }>("setting", "key, value")).find(
      (s) => s.key === "datev.revenue_accounts",
    )?.value ?? {}
  ) as ErloesKontenMap;
  if (!map.standard_19) throw new Error("setting datev.revenue_accounts fehlt/leer");
  return map;
}

/**
 * Für eine Rechnung (Debitor an Erlöskonto/-e) die Buchungszeilen erzeugen
 * bzw. neu erzeugen (alte Zeilen werden ersetzt, nicht ergänzt).
 */
export async function generateInvoiceBooking(invoiceId: string, map?: ErloesKontenMap) {
  const revenueAccounts = map ?? (await loadRevenueAccounts());
  const { data: inv, error: ie } = await supabase
    .from("sales_invoice")
    .select("organization_id, net_total, tax_total, gross_total, organization:organization(tax_country)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (ie || !inv) throw new Error(ie?.message ?? "Rechnung nicht gefunden");

  const { data: items } = await supabase
    .from("sales_invoice_item")
    .select("tax_rate, net_amount")
    .eq("sales_invoice_id", invoiceId);

  let revenueOverride: string | null = null;
  if (inv.organization_id) {
    const { data: org } = await supabase
      .from("organization")
      .select("default_revenue_account")
      .eq("id", inv.organization_id)
      .maybeSingle();
    if (org?.default_revenue_account) revenueOverride = org.default_revenue_account;
  }

  const org = inv.organization as unknown as { tax_country: string | null } | null;
  const zeilen = berechneRechnungsBuchungszeilen(
    { net_total: inv.net_total, tax_total: inv.tax_total, tax_country: org?.tax_country },
    (items ?? []) as RechnungsPosition[],
    revenueAccounts,
    revenueOverride,
  );

  await supabase.from("sales_invoice_booking").delete().eq("sales_invoice_id", invoiceId);
  if (zeilen.length) {
    const { error } = await supabase.from("sales_invoice_booking").insert(
      zeilen.map((z) => ({
        sales_invoice_id: invoiceId,
        ledger_account: z.ledger_account,
        tax_rate: z.tax_rate,
        net_amount: z.net_amount,
        tax_amount: z.tax_amount,
        gross_amount: z.gross_amount,
      })),
    );
    if (error) throw new Error(`sales_invoice_booking: ${error.message}`);
  }
  return { invoiceId, zeilen: zeilen.length };
}

/**
 * Buchungszeilen für alle finalisierten Rechnungen (Rechnungsnummer
 * vorhanden) nachziehen, die noch keine haben - Rechnungen mit
 * Rechnungsnummer gelten als festgeschrieben, daher keine Neuberechnung
 * bereits gebuchter Rechnungen (manuell über refreshInvoiceBooking bei
 * Bedarf, z.B. nach einer Korrektur).
 */
export async function syncInvoiceBookings(opts: Options = {}) {
  const { dryRun = false } = opts;
  const startedAt = new Date();
  const map = await loadRevenueAccounts();

  // Ältere Jahre sind längst abgeschlossen/gebucht (DATEV) - hier nur das
  // laufende Jahr betrachten, das hält den Datensatz klein und macht den
  // täglichen offen/erledigt-Abgleich schnell statt über alle ~15.000
  // historischen Rechnungen zu laufen.
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const invoices: { id: string }[] = [];
  const size = 1000;
  let fromRow = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("sales_invoice")
      .select("id")
      .in("kind", ["invoice", "credit_note"])
      .not("invoice_number", "is", null)
      .gte("invoice_date", yearStart)
      .range(fromRow, fromRow + size - 1);
    if (error) throw new Error(`sales_invoice lesen: ${error.message}`);
    invoices.push(...((data ?? []) as { id: string }[]));
    if (!data || data.length < size) break;
    fromRow += size;
  }

  // Ohne pagedSelect kappt PostgREST hier bei 1000 Zeilen (Supabase-Default) -
  // bei mehr bereits erzeugten Buchungen gälten alle weiteren fälschlich als
  // "offen" und würden bei jedem Cron-Lauf erneut erzeugt (Dauerschleife,
  // die bank:match/skonto:apply in derselben Kette dauerhaft blockiert).
  const existing = await pagedSelect<{ sales_invoice_id: string }>("sales_invoice_booking", "sales_invoice_id");
  const done = new Set(existing.map((r) => r.sales_invoice_id));
  const pending = invoices.filter((i) => !done.has(i.id));

  if (dryRun) return { gesamt: invoices.length, offen: pending.length, dryRun };

  let erzeugt = 0;
  let zeilen = 0;
  const fehler: string[] = [];
  for (const inv of pending) {
    try {
      const r = await generateInvoiceBooking(inv.id, map);
      erzeugt += 1;
      zeilen += r.zeilen;
    } catch (e) {
      fehler.push(`${inv.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await setSyncState("datev", "invoice_bookings", startedAt, fehler.length ? `${fehler.length} Fehler` : null);
  return { gesamt: invoices.length, offen: pending.length, erzeugt, zeilen, fehler, dryRun };
}
