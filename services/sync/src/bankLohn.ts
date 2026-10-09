import { supabase } from "./supabase";
import { pagedSelect } from "./db";

/**
 * Lohn-Zahlungen automatisch ausbuchen (beleglose Sachkonto-Zeile wie bank:gebuehren, auto = true):
 *   - Gehalt:  Überweisung an die IBAN eines Mitarbeiters aus `personal`            → 1740
 *   - Gehälter als Sammelüberweisung ("ANZAHL nn", ≥ 10 Posten) am Monatsende, Betrag höchstens 6 %
 *              neben den "Überweisung"-Zeilen auf 1740 im Lohnstapel desselben Monats
 *              (höchstens eine je Monat, die am besten passende)                   → 1740
 *   - LSt:     Finanzamt mit Lohnsteuer im Verwendungszweck ("LOHNST", "LSt-Anm.")   → 1741
 *   - SV:      Krankenkassen-Beiträge (AOK, TK, BKK, Knappschaft …) und die Direktversicherungen
 *              (Presse-Versorgung/Versorgungswerk der Presse, Nürnberger Lebens-
 *              versicherung, SV Lebensversicherung)                                 → 1742
 *   - U1/U2:   Eingang einer Krankenkasse in Höhe einer noch offenen AAG-Erstattung
 *              aus dem Lohnstapel ("AAG/Forderungskto." auf 1520)                   → 1520
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
// Direktversicherungen (bAV-Abzug im Lohnstapel auf 1742)
const DIREKTVERSICHERUNG = /presse-?versorgung|versorgungswerk der presse|n(ü|ue)rnberger lebensvers|^sv lebensversicherung/i;
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

  // Netto-Auszahlung je Lohnmonat laut Stapel (Zeilen "Überweisung" auf 1740) für Sammelüberweisungen
  const stapel = await pagedSelect<{ amount: number; soll_haben: string; buchungstext: string | null; beleg_datum: string | null; import_id: string }>(
    "payroll_booking",
    "amount, soll_haben, buchungstext, beleg_datum, import_id",
    ["gegenkonto", "1740"],
  );
  const importe = await pagedSelect<{ id: string; period_end: string | null }>("payroll_import", "id, period_end");
  const periode = new Map(importe.map((i) => [i.id, (i.period_end ?? "").slice(0, 7)]));
  const ueberweisung = new Map<string, number>();
  for (const z of stapel) {
    if (!/überweisung|ueberweisung/i.test(z.buchungstext ?? "")) continue;
    const m = periode.get(z.import_id) || (z.beleg_datum ?? "").slice(0, 7);
    if (!m) continue;
    ueberweisung.set(m, (ueberweisung.get(m) ?? 0) + (z.soll_haben === "S" ? z.amount : -z.amount));
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

  // Sammelüberweisungen je Lohnmonat: die am besten passende gewinnt
  const sammel = new Map<string, string>(); // tx.id -> Lohnmonat
  const besteJeMonat = new Map<string, { id: string; abw: number }>();
  for (const t of txs) {
    if (belegt.has(t.id)) continue;
    const anzahl = Number(/ANZAHL\s*0*(\d+)/i.exec(t.purpose ?? "")?.[1] ?? 0);
    if (anzahl < 10) continue;
    const d = new Date(`${t.booking_date}T00:00:00Z`);
    if (d.getUTCDate() <= 5) d.setUTCMonth(d.getUTCMonth() - 1); // Gehalt Ende Vormonat, gebucht Anfang Folgemonat
    else if (d.getUTCDate() < 20) continue;
    const monat = d.toISOString().slice(0, 7);
    const soll = ueberweisung.get(monat);
    if (!soll || soll <= 0) continue;
    const abw = Math.abs(Math.abs(t.amount) - soll) / soll;
    if (abw > 0.06) continue;
    const bisher = besteJeMonat.get(monat);
    if (!bisher || abw < bisher.abw) besteJeMonat.set(monat, { id: t.id, abw });
  }
  for (const [monat, b] of besteJeMonat) sammel.set(b.id, monat);

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
    } else if (sammel.has(t.id)) {
      konto = "1740";
      const [y, m] = sammel.get(t.id)!.split("-");
      text = `Gehälter ${m}/${y} Sammelüberweisung`;
    } else if (FINANZAMT.test(name) && LST_ZWECK.test(zweck)) {
      konto = "1741";
      text = `Lohnsteuer ${clean(zweck, 30)}`;
    } else if ((KRANKENKASSE.test(name) && SV_ZWECK.test(zweck)) || DIREKTVERSICHERUNG.test(name.trim())) {
      konto = "1742";
      text = `${DIREKTVERSICHERUNG.test(name.trim()) ? "Direktversicherung" : "SV-Beiträge"} ${clean(name, 35)}`;
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

  // U1/U2-Erstattungen: Eingänge von Krankenkassen gegen die offenen AAG-Forderungen (1520) aus dem Lohnstapel
  const forderungen = (
    await pagedSelect<{ amount: number; soll_haben: string }>("payroll_booking", "amount, soll_haben", ["gegenkonto", "1520"])
  )
    .filter((f) => f.soll_haben === "H") // 1755 im Haben → 1520 im Soll: Forderung entsteht
    .map((f) => Math.round(Math.abs(f.amount) * 100) / 100);
  const { data: schon } = await supabase.from("bank_transaction_match").select("amount").eq("ledger_account", "1520");
  const offen = [...forderungen];
  for (const m of schon ?? []) {
    const i = offen.findIndex((b) => Math.abs(b - Math.abs(Number(m.amount))) < 0.01);
    if (i >= 0) offen.splice(i, 1);
  }
  const { data: eingaenge } = await supabase
    .from("bank_transaction")
    .select("id, booking_date, amount, counterparty_name")
    .eq("match_status", "unmatched")
    .gt("amount", 0)
    .gte("booking_date", from)
    .order("booking_date")
    .limit(2000);
  for (const t of eingaenge ?? []) {
    if (!KRANKENKASSE.test(t.counterparty_name ?? "")) continue;
    const i = offen.findIndex((b) => Math.abs(b - t.amount) < 0.01);
    if (i < 0) continue;
    const { count } = await supabase.from("bank_transaction_match").select("id", { count: "exact", head: true }).eq("bank_transaction_id", t.id);
    if (count) continue;
    offen.splice(i, 1);
    const z = (ergebnis.nach_konto["1520"] ??= { anzahl: 0, summe: 0 });
    z.anzahl += 1;
    z.summe = Math.round((z.summe + t.amount) * 100) / 100;
    if (ergebnis.beispiele.length < 16) ergebnis.beispiele.push(`${t.booking_date} +${t.amount} ${clean(t.counterparty_name ?? "", 30)} → 1520`);
    if (dryRun) continue;
    const { error: e } = await supabase.from("bank_transaction_match").insert({
      bank_transaction_id: t.id,
      kind: "sonstige",
      ledger_account: "1520",
      amount: t.amount,
      note: clean(`U1/U2-Erstattung ${t.counterparty_name ?? ""}`, 60),
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
