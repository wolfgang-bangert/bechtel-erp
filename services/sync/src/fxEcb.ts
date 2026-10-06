import { supabase } from "./supabase";

/**
 * EZB-Referenzkurse laden (1 EUR = x Fremdwährung) für die Umrechnung von Fremdwährungsbelegen in der UStVA.
 * Standard: die letzten 90 Tage; mit alle=true die komplette Historie ab `ab` (Standard 2025-01-01).
 */
const URL_90 = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const URL_ALL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
const WAEHRUNGEN = new Set(["USD", "GBP", "CHF", "SEK", "DKK", "NOK", "PLN", "CZK", "HUF", "CAD", "AUD", "JPY", "CNY"]);

export async function fxEcb(opts: { alle?: boolean; ab?: string; dryRun?: boolean } = {}) {
  const { alle = false, ab = "2025-01-01", dryRun = false } = opts;
  const res = await fetch(alle ? URL_ALL : URL_90);
  if (!res.ok) throw new Error(`EZB-Abruf fehlgeschlagen: HTTP ${res.status}`);
  const xml = await res.text();

  const rows: { rate_date: string; currency: string; units_per_eur: number; source: string }[] = [];
  for (const m of xml.matchAll(/<Cube time="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g)) {
    const datum = m[1];
    if (datum < ab) continue;
    for (const c of m[2].matchAll(/<Cube currency="([A-Z]{3})" rate="([\d.]+)"\s*\/>/g)) {
      if (WAEHRUNGEN.has(c[1])) rows.push({ rate_date: datum, currency: c[1], units_per_eur: Number(c[2]), source: "ECB" });
    }
  }
  const tage = new Set(rows.map((r) => r.rate_date));
  const letzter = [...tage].sort().pop() ?? null;
  const usd = rows.filter((r) => r.currency === "USD").sort((a, b) => b.rate_date.localeCompare(a.rate_date))[0] ?? null;
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("fx_rate").upsert(rows.slice(i, i + 500), { onConflict: "rate_date,currency" });
      if (error) throw new Error(`fx_rate: ${error.message}`);
    }
  }
  return { zeilen: rows.length, tage: tage.size, letzter_tag: letzter, usd_letzter_kurs: usd };
}
