import { supabase } from "./supabase";

/**
 * Fremdwährungsbeleg auf EUR umrechnen (EZB-Referenzkurs aus fx_rate, letzter Kurs am/vor dem Belegdatum,
 * höchstens 10 Tage alt; oder der am Beleg hinterlegte Kurs). net/tax/gross, Skonto, tax_breakdown, Positionen
 * und Auftrags-Aufteilungen werden EUR-Beträge (die buchen DATEV/UStVA), der Originalbetrag bleibt in
 * fx_gross_amount, der Kurs in exchange_rate. Weicht die spätere Abbuchung (Karte/Bank) ab, wird der Beleg wie
 * bisher von Hand auf den tatsächlichen EUR-Betrag korrigiert.
 * Nur Belege, deren EUR-Felder noch Belegwährung tragen: currency ≠ EUR, ohne Kurs, und fx_gross_amount leer oder
 * gleich gross_amount.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

type Doc = {
  id: string;
  doc_number: string | null;
  doc_date: string | null;
  currency: string | null;
  net_amount: number | null;
  tax_amount: number | null;
  gross_amount: number | null;
  fx_gross_amount: number | null;
  exchange_rate: number | null;
  discount_amount: number | null;
  tax_breakdown: Record<string, number> | null;
  created_at: string;
};

const FELDER =
  "id, doc_number, doc_date, currency, net_amount, tax_amount, gross_amount, fx_gross_amount, exchange_rate, discount_amount, tax_breakdown, created_at";

export function nochInBelegwaehrung(d: Pick<Doc, "currency" | "exchange_rate" | "fx_gross_amount" | "gross_amount">): boolean {
  const cur = (d.currency ?? "EUR").toUpperCase();
  if (cur === "EUR" || d.exchange_rate != null || d.gross_amount == null) return false;
  return d.fx_gross_amount == null || Math.abs(Number(d.fx_gross_amount) - Number(d.gross_amount)) < 0.005;
}

async function kurs(cur: string, datum: string): Promise<{ rate: number; datum: string } | null> {
  const von = new Date(Date.parse(`${datum}T00:00:00Z`) - 10 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("fx_rate")
    .select("rate_date, units_per_eur")
    .eq("currency", cur)
    .lte("rate_date", datum)
    .gte("rate_date", von)
    .order("rate_date", { ascending: false })
    .limit(1);
  return data?.[0] ? { rate: Number(data[0].units_per_eur), datum: data[0].rate_date } : null;
}

/** Einen Beleg umrechnen. Gibt eine Logzeile zurück oder null, wenn nichts zu tun ist (oder kein Kurs da ist). */
export async function belegFxUmrechnen(id: string, dryRun = false): Promise<string | null> {
  const { data } = await supabase.from("incoming_document").select(FELDER).eq("id", id).maybeSingle();
  const d = data as Doc | null;
  if (!d || !nochInBelegwaehrung(d)) return null;
  const cur = (d.currency ?? "").toUpperCase();
  const k = await kurs(cur, d.doc_date ?? d.created_at.slice(0, 10));
  if (!k || !(k.rate > 0)) return `${d.doc_number ?? d.id.slice(0, 8)}: kein ${cur}-Kurs zum ${d.doc_date ?? "?"} – nicht umgerechnet`;
  const eur = (v: number | null) => (v == null ? null : r2(Number(v) / k.rate));

  const brutto = eur(d.gross_amount)!;
  const steuer = eur(d.tax_amount);
  // Netto als Rest, damit Netto + Steuer = Brutto bleibt
  const netto = d.net_amount == null ? null : steuer == null ? eur(d.net_amount) : r2(brutto - steuer);
  const tb = d.tax_breakdown ? Object.fromEntries(Object.entries(d.tax_breakdown).map(([s, v]) => [s, r2(Number(v) / k.rate)])) : d.tax_breakdown;
  const zeile = `${d.doc_number ?? d.id.slice(0, 8)}: ${Number(d.gross_amount).toFixed(2)} ${cur} → ${brutto.toFixed(2)} EUR (Kurs ${k.rate} vom ${k.datum})`;
  if (dryRun) return zeile;

  const { error } = await supabase
    .from("incoming_document")
    .update({
      fx_gross_amount: d.gross_amount,
      exchange_rate: k.rate,
      gross_amount: brutto,
      tax_amount: steuer,
      net_amount: netto,
      discount_amount: eur(d.discount_amount),
      tax_breakdown: tb,
    })
    .eq("id", d.id);
  if (error) throw new Error(`${d.doc_number}: ${error.message}`);

  const { data: items } = await supabase.from("incoming_document_item").select("id, net_amount, unit_price").eq("incoming_document_id", d.id);
  for (const it of items ?? []) {
    await supabase.from("incoming_document_item").update({ net_amount: eur(it.net_amount), unit_price: eur(it.unit_price) }).eq("id", it.id);
    const { data: al } = await supabase.from("incoming_document_allocation").select("id, amount").eq("incoming_document_item_id", it.id);
    for (const a of al ?? []) await supabase.from("incoming_document_allocation").update({ amount: eur(a.amount) }).eq("id", a.id);
  }
  return zeile;
}

/** Alle noch nicht umgerechneten Fremdwährungsbelege (nicht verworfen, nicht bezahlt). */
export async function fxUmrechnen(opts: { dryRun?: boolean; nummer?: string } = {}) {
  const { dryRun = false } = opts;
  let q = supabase.from("incoming_document").select(FELDER).neq("currency", "EUR").is("exchange_rate", null).neq("status", "rejected").neq("payment_status", "paid");
  if (opts.nummer) q = q.ilike("doc_number", opts.nummer);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const ergebnis = { gesehen: 0, umgerechnet: [] as string[], ohneKurs: [] as string[], fehler: [] as string[], dryRun };
  for (const d of (data ?? []) as Doc[]) {
    if (!nochInBelegwaehrung(d)) continue;
    ergebnis.gesehen++;
    try {
      const z = await belegFxUmrechnen(d.id, dryRun);
      if (z?.includes("kein ")) ergebnis.ohneKurs.push(z);
      else if (z) ergebnis.umgerechnet.push(z);
    } catch (e) {
      ergebnis.fehler.push(e instanceof Error ? e.message : String(e));
    }
  }
  return ergebnis;
}
