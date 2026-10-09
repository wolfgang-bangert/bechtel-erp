import { supabase } from "./supabase";

/**
 * Steuerzahlungen ans Finanzamt automatisch ausbuchen (beleglose Sachkonto-Zeilen, auto = true), anhand
 * des Verwendungszwecks des Finanzamts. Eine Zahlung mit mehreren Teilen ("UMS.ST DEZ.25 22.557,14EUR
 * UMS.ST VZ2026 32.220,00EUR") wird aufgeteilt - nur wenn die Teile zusammen den Zahlbetrag ergeben.
 *   UMS.ST <Monat/Quartal>.<JJ>   laufendes Jahr → 1780, Vorjahr → 1790, früher → 1791
 *   UMS.ST VZ<JJJJ>               Sondervorauszahlung Dauerfristverlängerung → 1781
 *   UMS.ST <JJJJ>                 Jahressteuer: Vorjahr → 1790, früher → 1791
 *   KOERPST … VERWALTUNGS…        Körperschaftsteuer der Verwaltungs-GmbH (über das KG-Konto) → 880
 * Lohnsteuer (LOHNST) bucht bank:lohn. Nur ausgehende, völlig unzugeordnete Bankzeilen.
 */
type Options = { dryRun?: boolean; from?: string };
type Teil = { konto: string; betrag: number; text: string };

const MONAT: Record<string, string> = { JAN: "01", FEB: "02", MRZ: "03", MAR: "03", APR: "04", MAI: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OKT: "10", NOV: "11", DEZ: "12" };
const betragVon = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Konto nach Steuerjahr relativ zum Zahlungsjahr. */
const ustKonto = (steuerjahr: number, zahljahr: number) => (steuerjahr >= zahljahr ? "1780" : steuerjahr === zahljahr - 1 ? "1790" : "1791");

export function steuerTeile(zweck: string, zahldatum: string): Teil[] | null {
  const z = zweck.replace(/\s+/g, " ").toUpperCase();
  const zahljahr = Number(zahldatum.slice(0, 4));
  const teile: Teil[] = [];

  if (/KOERPST|KÖRPST|KÖRPERSCHAFTST/.test(z) && /VERWALTUNGS/.test(z)) {
    for (const m of z.matchAll(/(?:KOERPST|KÖRPST)\s+([^\s]+)\s+([\d.]+,\d{2})\s?EUR/g))
      teile.push({ konto: "880", betrag: betragVon(m[2]), text: `KöSt Verwaltungs-GmbH ${m[1]}` });
    return teile.length ? teile : null;
  }

  for (const m of z.matchAll(/UMS\.?\s?ST\.?\s+([A-Z0-9.]+?)\s+([\d.]+,\d{2})\s?EUR/g)) {
    const zeitraum = m[1].replace(/\.$/, "");
    const betrag = betragVon(m[2]);
    let mm: RegExpMatchArray | null;
    if ((mm = /^VZ\s?(\d{4})$/.exec(zeitraum))) {
      teile.push({ konto: "1781", betrag, text: `USt-Sondervorauszahlung ${mm[1]}` });
    } else if ((mm = /^([A-Z]{3})\.(\d{2})$/.exec(zeitraum)) && MONAT[mm[1]]) {
      const jahr = 2000 + Number(mm[2]);
      teile.push({ konto: ustKonto(jahr, zahljahr), betrag, text: `USt ${MONAT[mm[1]]}/${jahr}` });
    } else if ((mm = /^(\d)\s?VJ\.(\d{2})$/.exec(zeitraum))) {
      const jahr = 2000 + Number(mm[2]);
      teile.push({ konto: ustKonto(jahr, zahljahr), betrag, text: `USt ${mm[1]}. Vj. ${jahr}` });
    } else if ((mm = /^(\d{4})$/.exec(zeitraum))) {
      const jahr = Number(mm[1]);
      teile.push({ konto: jahr >= zahljahr - 1 ? "1790" : "1791", betrag, text: `USt Jahressteuer ${jahr}` });
    } else return null; // unbekannter Zeitraum → lieber von Hand
  }
  return teile.length ? teile : null;
}

export async function bankSteuern(opts: Options = {}) {
  const { dryRun = false } = opts;
  const from = opts.from ?? new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bank_transaction")
    .select("id, booking_date, amount, counterparty_name, purpose")
    .eq("match_status", "unmatched")
    .lt("amount", 0)
    .gte("booking_date", from)
    .ilike("counterparty_name", "%finanzamt%")
    .order("booking_date")
    .limit(2000);
  if (error) throw new Error(error.message);

  const ergebnis = { gesehen: data?.length ?? 0, gebucht: [] as string[], uebersprungen: [] as string[], fehler: [] as string[], dryRun, from };
  for (const t of data ?? []) {
    const { count } = await supabase.from("bank_transaction_match").select("id", { count: "exact", head: true }).eq("bank_transaction_id", t.id);
    if (count) continue;
    const teile = steuerTeile(t.purpose ?? "", t.booking_date);
    if (!teile) {
      if (!/LOHNST|LST/i.test(t.purpose ?? "")) ergebnis.uebersprungen.push(`${t.booking_date} ${t.amount} ${(t.purpose ?? "").slice(0, 60)}`);
      continue;
    }
    const summe = r2(teile.reduce((s, p) => s + p.betrag, 0));
    if (Math.abs(summe - Math.abs(t.amount)) > 0.01) {
      ergebnis.uebersprungen.push(`${t.booking_date} ${t.amount}: Teile ergeben ${summe} – von Hand prüfen`);
      continue;
    }
    ergebnis.gebucht.push(`${t.booking_date} ${t.amount} → ${teile.map((p) => `${p.konto} ${p.betrag} „${p.text}“`).join(" + ")}`);
    if (dryRun) continue;
    const { error: e } = await supabase.from("bank_transaction_match").insert(
      teile.map((p) => ({ bank_transaction_id: t.id, kind: "sonstige", ledger_account: p.konto, amount: -p.betrag, note: p.text, auto: true })),
    );
    if (e) {
      ergebnis.fehler.push(`${t.booking_date} ${t.amount}: ${e.message}`);
      continue;
    }
    await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", t.id);
  }
  return ergebnis;
}
