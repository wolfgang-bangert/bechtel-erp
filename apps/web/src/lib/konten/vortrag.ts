import type { SupabaseClient } from "@supabase/supabase-js";

/** Saldovorträge (Anfangsbestand 01.01.) je Konto: Soll positiv, Haben negativ. */
export async function ladeVortraege(sb: SupabaseClient, jahr: number | string): Promise<Map<string, number>> {
  const { data } = await sb.from("konto_vortrag").select("konto, saldo").eq("jahr", Number(jahr));
  return new Map((data ?? []).map((v) => [v.konto as string, Number(v.saldo)]));
}

export type VortragVorschlag = { konto: string; saldo: number; grund: string };

const MONAT = /(JAN|FEB|MRZ|MAR|APR|MAI|JUN|JUL|AUG|SEP|OKT|NOV|DEZ)\.(\d{2})/i;

/**
 * Vorschläge aus Zahlungen im Jahr, die einen Vorjahreszeitraum betreffen - deren Verbindlichkeit
 * stand am 01.01. offen (Haben):
 *   - 1741: Finanzamt-Zahlungen mit "LOHNST <Monat>.<Vorjahr>" im Verwendungszweck
 *   - 1790: alle Zahlungen auf "Umsatzsteuer Vorjahr" im Jahr
 */
export async function vortragVorschlaege(sb: SupabaseClient, jahr: number): Promise<VortragVorschlag[]> {
  const vj = String(jahr - 1).slice(2);
  type M = { amount: number; ledger_account: string; bank_transaction: { booking_date: string; amount: number; purpose: string | null } | { booking_date: string; amount: number; purpose: string | null }[] | null };
  const { data } = await sb
    .from("bank_transaction_match")
    .select("amount, ledger_account, bank_transaction:bank_transaction_id(booking_date, amount, purpose)")
    .in("ledger_account", ["1741", "1790"])
    .limit(5000);
  let lst = 0;
  let lstN = 0;
  let ust = 0;
  let ustN = 0;
  for (const m of (data ?? []) as M[]) {
    const t = Array.isArray(m.bank_transaction) ? m.bank_transaction[0] : m.bank_transaction;
    if (!t || !t.booking_date.startsWith(String(jahr)) || t.amount >= 0) continue;
    if (m.ledger_account === "1741") {
      const mm = MONAT.exec(t.purpose ?? "");
      if (/LOHNST|LST/i.test(t.purpose ?? "") && mm && mm[2] === vj) {
        lst += Math.abs(m.amount);
        lstN++;
      }
    } else {
      ust += Math.abs(m.amount);
      ustN++;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const out: VortragVorschlag[] = [];
  if (lstN) out.push({ konto: "1741", saldo: -r2(lst), grund: `${lstN} Lohnsteuer-Zahlung(en) ${jahr} für Zeiträume ${jahr - 1}` });
  if (ustN) out.push({ konto: "1790", saldo: -r2(ust), grund: `${ustN} Zahlung(en) ${jahr} auf Umsatzsteuer Vorjahr` });
  return out;
}
