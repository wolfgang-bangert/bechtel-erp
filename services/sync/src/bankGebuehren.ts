import { supabase } from "./supabase";
import { pagedSelect } from "./db";

/**
 * Bankgebühren und Zinsen automatisch buchen: unzugeordnete Bankzeilen, die eindeutig Entgelte oder Zinsen der
 * Bank sind, bekommen eine Sonderbuchung (kind "sonstige", ohne Beleg) auf das Gebühren- bzw. Zinskonto.
 *  - Zinsen (Sollzinsen, Überziehungsprovision) und Kreditbereitstellungsprovision -> 2110
 *  - Kontoführung, Spesen, Kartenentgelt, elektronischer Kontoauszug, Oberbank-Entgelte -> 4970 (Nebenkosten des Geldverkehrs)
 * Buchungstext (DATEV): "<Kontonummer> <Bank> <Art der Gebühr>", z. B. "0667 Oberbank Kontoführung".
 * Darlehen Oberbank 1801-1118.55 (Sonderbetriebsvermögen): Zinsen ("Sollzinsen W/KTO 1801-1118.55") und die monatliche Rate
 * ("Rate Darl. Nr. 1801.1118.55") werden nicht als Aufwand gebucht, sondern nach festem Schlüssel aufgeteilt:
 * 80,16 % -> 1705 Verrechnungskonto Sonderbetriebsvermögen, 19,84 % -> 1800 Privatentnahmen allgemein (nie 1900: das war nur ein Behelf in BuchhaltungsButler).
 * Sammelposten wie "ABSCHLUSS PER ..." oder "Abrechnung ... Information zur Abrechnung" enthalten Zinsen und Entgelte
 * gemischt und werden NICHT automatisch gebucht (stehen im Ergebnis unter "manuell").
 */

const KONTO_ZINSEN = "2110";
/** Aufteilung des Oberbank-Darlehens (wie in BuchhaltungsButler): Anteil Sonderbetriebsvermögen, Rest privat. */
const SBV_ANTEIL = 0.8016;
const KONTO_SBV = "1705";
const KONTO_PRIVAT = "1800";
const KONTO_GEBUEHREN = "4970";

type Tx = {
  id: string;
  bank_account_id: string;
  booking_date: string;
  amount: number;
  counterparty_name: string | null;
  purpose: string | null;
  match_status: string;
};

const MONATE = /(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/i;
const OBERBANK_ENTGELTE: [RegExp, string][] = [
  [/KUNDENPORTAL\s*BUSINESS/i, "Kundenportal Business"],
  [/ZVAUFTRAEGE-RECHENZENTRUM/i, "ZV-Aufträge Rechenzentrum"],
  [/EBICS\/MCFT\s*ZUGANG/i, "EBICS/MCFT Zugang"],
  [/KONTOAUSZUG-RECHENZENTRUM/i, "Kontoauszug Rechenzentrum"],
  [/HBCI-PLUS\s*ZUGANG/i, "HBCI-Plus Zugang"],
];

/** Art der Gebühr und Konto; null = keine eindeutige Bankgebühr. */
export type Klasse = { konto: string; art: string; teilung?: { sbv: string; privat: string } };

/** Darlehen 1801-1118.55: Zinsen bzw. Rate nach Schlüssel auf Sonderbetriebsvermögen/Privat aufteilen. */
export function darlehenKlasse(tx: Pick<Tx, "counterparty_name" | "purpose">): Klasse | null {
  const text = `${tx.counterparty_name ?? ""} ${tx.purpose ?? ""}`.replace(/\s+/g, " ");
  if (!/1801[.\-\s]?111/.test(text)) return null;
  if (/Sollzinsen/i.test(text))
    return { konto: KONTO_SBV, art: "Darlehen Zinsen", teilung: { sbv: "Oberbank DL Zinsen 855 80,16% SBV", privat: "Oberbank DL Zinsen 855 19,84% Privat" } };
  if (/Rate\s*Darl/i.test(text))
    return { konto: KONTO_SBV, art: "Darlehen Tilgung", teilung: { sbv: "Oberbank DL Tilg. 855 80,16% SBV", privat: "Oberbank DL Tilg. 855 19,84% Privat" } };
  return null;
}

export function klassifiziere(tx: Pick<Tx, "counterparty_name" | "purpose">): Klasse | null {
  const dl = darlehenKlasse(tx);
  if (dl) return dl;
  const cp = (tx.counterparty_name ?? "").replace(/\s+/g, " ").trim();
  const pu = (tx.purpose ?? "").replace(/\s+/g, " ").trim();
  const text = `${cp} ${pu}`;

  // Zinsen / Kreditbereitstellung -> 2110
  if (/^Kreditbereitstellungsprovision/i.test(cp) || /^Kreditbereitstellungsprovision/i.test(pu))
    return { konto: KONTO_ZINSEN, art: "Kreditbereitstellungsprovision" };
  if (/^Überziehungsprovision/i.test(cp) || /^Überziehungsprovision/i.test(pu))
    return { konto: KONTO_ZINSEN, art: "Überziehungsprovision" };
  const soll = /^(Sollzinsen)(?:\s+W\/KTO\s*([\d.\-]+))?/i.exec(cp) ?? /^(Sollzinsen)(?:\s+W\/KTO\s*([\d.\-]+))?/i.exec(pu);
  if (soll) return { konto: KONTO_ZINSEN, art: soll[2] ? `Sollzinsen Kto ${soll[2]}` : "Sollzinsen" };

  // Entgelte -> 4970
  if (/^Kontoführung$/i.test(cp) || /^Kontoführung$/i.test(pu)) return { konto: KONTO_GEBUEHREN, art: "Kontoführung" };
  if (/^Spesen$/i.test(cp) || /^Spesen$/i.test(pu)) return { konto: KONTO_GEBUEHREN, art: "Spesen" };
  if (/^Kartenentgelt$/i.test(cp) || /^Kartenentgelt$/i.test(pu)) return { konto: KONTO_GEBUEHREN, art: "Kartenentgelt" };
  if (/Entgelt\s*SpkCard/i.test(text)) return { konto: KONTO_GEBUEHREN, art: "Kartenentgelt Debitkarte" };
  const ka = /Elektr\.?\s*Kontoauszug/i.test(text);
  if (ka) {
    const m = MONATE.exec(text);
    return { konto: KONTO_GEBUEHREN, art: m ? `Elektr. Kontoauszug ${m[1]}` : "Elektr. Kontoauszug" };
  }
  if (/^Oberbank AG/i.test(cp) && /GEBÜHR/i.test(text)) {
    const e = OBERBANK_ENTGELTE.find(([re]) => re.test(text));
    return { konto: KONTO_GEBUEHREN, art: e ? `${e[1]} Gebühr` : "Gebühr" };
  }
  return null;
}

const bankKurz = (name: string | null) => {
  const n = (name ?? "").trim();
  if (/^oberbank/i.test(n)) return "Oberbank";
  if (/^b\.?\s*w\.?\s*bank/i.test(n)) return "BW Bank";
  return n || "Bank";
};

const clean = (s: string, max: number) => s.replace(/[;"\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export async function bankGebuehren(opts: { dryRun?: boolean; from?: string } = {}) {
  const { dryRun = false, from = "2026-01-01" } = opts;

  const { data: konten } = await supabase.from("bank_account").select("id, label, bank_name");
  const konto = new Map(
    (konten ?? []).map((k) => [k.id, { nr: (k.label ?? "").replace(/^Konto\s*/i, "").trim(), bank: bankKurz(k.bank_name) }]),
  );

  // Früher als Zinsen (2110) gebuchte Darlehenszinsen 1801-1118.55 (automatisch angelegt) zurücknehmen -> werden unten aufgeteilt neu gebucht
  const korrigiert: string[] = [];
  const altTx = new Set<string>();
  const { data: alt } = await supabase
    .from("bank_transaction_match")
    .select("id, bank_transaction_id, note")
    .eq("kind", "sonstige")
    .eq("ledger_account", KONTO_ZINSEN)
    .eq("auto", true)
    .like("note", "%Sollzinsen Kto 1801-1118.55%");
  for (const m of alt ?? []) {
    korrigiert.push(m.id);
    altTx.add(m.bank_transaction_id);
    if (dryRun) continue;
    await supabase.from("bank_transaction_match").delete().eq("id", m.id);
    await supabase.from("bank_transaction").update({ match_status: "unmatched" }).eq("id", m.bank_transaction_id);
  }

  const txs = (
    await pagedSelect<Tx>("bank_transaction", "id, bank_account_id, booking_date, amount, counterparty_name, purpose, match_status")
  ).filter((t) => (t.match_status === "unmatched" || (dryRun && altTx.has(t.id))) && t.amount < 0 && t.booking_date >= from);

  const ergebnis = {
    zurueckgenommen_2110_darlehenszinsen: korrigiert.length,
    geprueft: txs.length,
    gebucht: 0,
    summe: 0,
    nach_konto: {} as Record<string, { anzahl: number; summe: number }>,
    beispiele: [] as string[],
    manuell: [] as string[],
    fehler: [] as string[],
  };

  for (const t of txs) {
    const k = klassifiziere(t);
    const text = `${t.counterparty_name ?? ""} ${t.purpose ?? ""}`;
    if (!k) {
      if (/^ABSCHLUSS PER|Information\s*zur\s*Abrechnung/i.test(text.replace(/\s+/g, " ")))
        ergebnis.manuell.push(`${t.booking_date} ${t.amount.toFixed(2)} ${clean(text, 50)}`);
      continue;
    }
    const b = konto.get(t.bank_account_id) ?? { nr: "", bank: "Bank" };
    const buchungstext = clean(`${b.nr} ${b.bank} ${k.art}`, 60);
    const teile = k.teilung
      ? (() => {
          const sbv = Math.round(Math.abs(t.amount) * SBV_ANTEIL * 100) / 100;
          const privat = Math.round((Math.abs(t.amount) - sbv) * 100) / 100;
          return [
            { konto: KONTO_SBV, betrag: -sbv, text: k.teilung.sbv },
            { konto: KONTO_PRIVAT, betrag: -privat, text: k.teilung.privat },
          ];
        })()
      : [{ konto: k.konto, betrag: t.amount, text: buchungstext }];
    ergebnis.gebucht += 1;
    ergebnis.summe = Math.round((ergebnis.summe + t.amount) * 100) / 100;
    for (const p of teile) {
      const z = (ergebnis.nach_konto[p.konto] ??= { anzahl: 0, summe: 0 });
      z.anzahl += 1;
      z.summe = Math.round((z.summe + p.betrag) * 100) / 100;
    }
    if (ergebnis.beispiele.length < 14 && (k.teilung || Math.random() < 0.2))
      ergebnis.beispiele.push(`${t.booking_date} ${t.amount} → ${teile.map((p) => `${p.konto} ${p.betrag} „${p.text}“`).join(" + ")}`);
    if (dryRun) continue;
    const { error } = await supabase.from("bank_transaction_match").insert(
      teile.map((p) => ({
        bank_transaction_id: t.id,
        kind: "sonstige",
        ledger_account: p.konto,
        amount: p.betrag,
        note: p.text,
        auto: true,
      })),
    );
    if (error) {
      ergebnis.fehler.push(`${t.booking_date} ${t.amount}: ${error.message}`);
      continue;
    }
    await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", t.id);
  }
  return ergebnis;
}
