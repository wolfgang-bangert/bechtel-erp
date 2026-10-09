import { supabase } from "./supabase";
import { pagedSelect } from "./db";

/**
 * Lohn-Zahlungen automatisch ausbuchen (beleglose Sachkonto-Zeile wie bank:gebuehren, auto = true):
 *   - Gehalt:  Überweisung an die IBAN eines Mitarbeiters aus `personal`            → 1740
 *   - LSt:     Finanzamt mit Lohnsteuer im Verwendungszweck ("LOHNST", "LSt-Anm.")   → 1741
 *   - SV:      Krankenkassen-Beiträge (AOK, TK, BKK, Knappschaft …) und Presse-
 *              Versorgung/Versorgungswerk der Presse (Direktversicherung)          → 1742
 * Nur ausgehende, noch völlig unzugeordnete Bankzeilen. In /bank lässt sich jede Buchung wie gewohnt
 * wieder entfernen. Läuft täglich nach dem Bankabruf; einmalig mit --from=2026-01-01 für den Altbestand.
 */
type Options = { dryRun?: boolean; from?: string };

type Tx = {
  id: string;
  booking_date: string;
  amount: number;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  purpose: string | null;
};

const KRANKENKASSE =
  /\baok\b|krankenkasse|\bbarmer\b|\bdak\b|\bikk\b|\bbkk\b|betriebskrankenkasse|\bsbk\b|knappschaft|\bhkk\b|\bmhplus\b|\bviactiv\b|\bkkh\b|\bhek\b|minijob-zentrale|\bsvlfg\b/i;
const PRESSE_VERSORGUNG = /presse-?versorgung|versorgungswerk der presse/i;
const SV_ZWECK = /beitr|bnr\.?|ob-\d|beitragsnachweis|sv-beitr|\d{2}\/\d{2}/i;
const FINANZAMT = /finanzamt/i;
const LST_ZWECK = /lohnst|\blst\b|lst-anm|lohnsteuer/i;

const normIban = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();
const clean = (s: string, max: number) => s.replace(/[";\r\n]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

export async function bankLohn(opts: Options = {}) {
  const { dryRun = false } = opts;
  const from = opts.from ?? new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);

  const leute = await pagedSelect<{ vorname: string | null; nachname: string | null; iban: string | null; zahlungsempfaenger: string | null }>(
    "personal",
    "vorname, nachname, iban, zahlungsempfaenger",
  );
  const mitarbeiter = new Map<string, string>();
  for (const p of leute) {
    const iban = normIban(p.iban);
    if (iban.length >= 15) mitarbeiter.set(iban, [p.vorname, p.nachname].filter(Boolean).join(" ") || p.zahlungsempfaenger || "Mitarbeiter");
  }

  const { data, error } = await supabase
    .from("bank_transaction")
    .select("id, booking_date, amount, counterparty_name, counterparty_iban, purpose")
    .eq("match_status", "unmatched")
    .lt("amount", 0)
    .gte("booking_date", from)
    .order("booking_date")
    .limit(5000);
  if (error) throw new Error(error.message);
  const txs = (data ?? []) as Tx[];

  // Sicherheitsnetz: Zeilen mit irgendeiner Zuordnung (auch Teil-Zuordnung) nie anfassen
  const ids = txs.map((t) => t.id);
  const belegt = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: m } = await supabase.from("bank_transaction_match").select("bank_transaction_id").in("bank_transaction_id", ids.slice(i, i + 300));
    for (const x of m ?? []) belegt.add(x.bank_transaction_id as string);
  }

  const ergebnis = { gesehen: txs.length, nach_konto: {} as Record<string, { anzahl: number; summe: number }>, beispiele: [] as string[], fehler: [] as string[], dryRun, from };

  for (const t of txs) {
    if (belegt.has(t.id)) continue;
    const name = t.counterparty_name ?? "";
    const zweck = t.purpose ?? "";
    let konto: string | null = null;
    let text = "";
    const ma = mitarbeiter.get(normIban(t.counterparty_iban));
    if (ma) {
      konto = "1740";
      text = `Gehalt ${ma}`;
    } else if (FINANZAMT.test(name) && LST_ZWECK.test(zweck)) {
      konto = "1741";
      text = `Lohnsteuer ${clean(zweck, 30)}`;
    } else if ((KRANKENKASSE.test(name) && SV_ZWECK.test(zweck)) || PRESSE_VERSORGUNG.test(name)) {
      konto = "1742";
      text = `${PRESSE_VERSORGUNG.test(name) ? "Direktversicherung" : "SV-Beiträge"} ${clean(name, 35)}`;
    }
    if (!konto) continue;

    const z = (ergebnis.nach_konto[konto] ??= { anzahl: 0, summe: 0 });
    z.anzahl += 1;
    z.summe = Math.round((z.summe + t.amount) * 100) / 100;
    if (ergebnis.beispiele.length < 12) ergebnis.beispiele.push(`${t.booking_date} ${t.amount} ${clean(name, 30)} → ${konto}`);
    if (dryRun) continue;

    const { error: e } = await supabase.from("bank_transaction_match").insert({
      bank_transaction_id: t.id,
      kind: "sonstige",
      ledger_account: konto,
      amount: t.amount,
      note: clean(text, 60),
      auto: true,
    });
    if (e) {
      ergebnis.fehler.push(`${t.booking_date} ${t.amount}: ${e.message}`);
      continue;
    }
    await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", t.id);
  }
  return ergebnis;
}
