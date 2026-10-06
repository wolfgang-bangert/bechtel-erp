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
 * Weitere Banken: BW Bank (EBICS/ZV-App, Kontoauszug für Dritte), Volksbank (Abschluss netto + gesonderte USt-Zeile -> Vorsteuer 1576),
 * Kreissparkasse (Rechnungen Firmenkundenportal/Auslandszahlungsverkehr "siehe Anlage" mit 19 % USt -> netto 4970 + Vorsteuer 1576;
 * liegt der Beleg schon als Eingangsrechnung vor, wird dieser bezahlt).
 * Sammelposten wie "ABSCHLUSS PER ..." oder "Abrechnung ... Information zur Abrechnung" enthalten Zinsen und Entgelte
 * gemischt und werden NICHT automatisch gebucht (stehen im Ergebnis unter "manuell").
 */

const KONTO_ZINSEN = "2110";
/** Aufteilung des Oberbank-Darlehens (wie in BuchhaltungsButler): Anteil Sonderbetriebsvermögen, Rest privat. */
const SBV_ANTEIL = 0.8016;
const KONTO_SBV = "1705";
const KONTO_PRIVAT = "1800";
const KONTO_GEBUEHREN = "4970";
const KONTO_VST19 = "1576";
const KONTO_VST7 = "1571";
const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

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
export type Klasse = {
  konto: string;
  art: string;
  teilung?: { sbv: string; privat: string };
  /** Betrag enthält USt (brutto): in Netto (Gebührenkonto) und Vorsteuer (1576/1571) aufteilen */
  mitUst?: number;
  /** Zeile ist selbst nur die USt zu einer anderen Gebührenzeile (Netto aus dem Text) */
  nurUst?: { satz: number; netto: number };
  /** Rechnungsnummer der Bank (BWxxx-...) - existiert ein Eingangsbeleg, wird dieser bezahlt statt Gebühr gebucht */
  belegNr?: string;
};

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

  // Volksbank: Abschluss (netto) + gesonderte Zeile "19% Umsatzsteuer auf EUR x" (Vorsteuer)
  const abschl = /^ABSCHLUSS PER (\d{2})\.(\d{2})\.(\d{4})/i.exec(cp) ?? /^ABSCHLUSS PER (\d{2})\.(\d{2})\.(\d{4})/i.exec(pu);
  if (abschl) return { konto: KONTO_GEBUEHREN, art: `Abschluss ${MONATSNAMEN[Number(abschl[2]) - 1]} ${abschl[3]}` };
  const ustZeile = /^(\d{1,2})%\s*Umsatzsteuer auf EUR\s*([\d.]+,\d{2})/i.exec(cp) ?? /^(\d{1,2})%\s*Umsatzsteuer auf EUR\s*([\d.]+,\d{2})/i.exec(pu);
  if (ustZeile) {
    const satz = Number(ustZeile[1]);
    const netto = Number(ustZeile[2].replace(/\./g, "").replace(",", "."));
    return { konto: satz === 7 ? KONTO_VST7 : KONTO_VST19, art: `Umsatzsteuer ${satz} % auf Abschluss`, nurUst: { satz, netto } };
  }
  // BW Bank: Pauschalen
  const ebics = /EBICS\/ZV-App\s+(\S+)/i.exec(text);
  if (ebics && (/^EBICS\/ZV-App/i.test(cp) || /^EBICS\/ZV-App/i.test(pu))) return { konto: KONTO_GEBUEHREN, art: `EBICS/ZV-App ${ebics[1]}` };
  if (/^Kontoausz\.?\s*f\.?\s*Dritte/i.test(cp) || /^Kontoausz\.?\s*f\.?\s*Dritte/i.test(pu)) {
    const m = MONATE.exec(text);
    return { konto: KONTO_GEBUEHREN, art: m ? `Kontoauszug für Dritte ${m[1]}` : "Kontoauszug für Dritte" };
  }
  // Kreissparkasse: Rechnungen der Bank "siehe Anlage" (Firmenkundenportal, Auslandszahlungsverkehr) enthalten 19 % USt
  const ksk = /Rechnung\s*(Firmenkundenportal|Auslandszahlungsverkehr)\s*(\d{8})-(BW\d{3}-\d+)/i.exec(text.replace(/\s+/g, " "));
  if (ksk) return { konto: KONTO_GEBUEHREN, art: `${ksk[1]} ${ksk[3]}`, mitUst: 19, belegNr: ksk[3] };

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

  // Info-Zeilen der Bank ohne Betrag (0,00 €) gibt es nichts zu buchen -> als ignoriert markieren
  let ignoriert = 0;
  {
    const { data: nullzeilen } = await supabase.from("bank_transaction").select("id").eq("amount", 0).eq("match_status", "unmatched");
    ignoriert = (nullzeilen ?? []).length;
    if (!dryRun && ignoriert) await supabase.from("bank_transaction").update({ match_status: "ignored" }).in("id", (nullzeilen ?? []).map((z) => z.id));
  }

  const ergebnis = {
    null_betrag_ignoriert: ignoriert,
    zurueckgenommen_2110_darlehenszinsen: korrigiert.length,
    geprueft: txs.length,
    gebucht: 0,
    summe: 0,
    nach_konto: {} as Record<string, { anzahl: number; summe: number }>,
    beispiele: [] as string[],
    beleg_bezahlt: [] as string[],
    manuell: [] as string[],
    fehler: [] as string[],
  };

  for (const t of txs) {
    const k = klassifiziere(t);
    const text = `${t.counterparty_name ?? ""} ${t.purpose ?? ""}`;
    if (!k) {
      if (/Information\s*zur\s*Abrechnung/i.test(text.replace(/\s+/g, " ")))
        ergebnis.manuell.push(`${t.booking_date} ${t.amount.toFixed(2)} ${clean(text, 50)}`);
      continue;
    }
    const b = konto.get(t.bank_account_id) ?? { nr: "", bank: "Bank" };
    const buchungstext = clean(`${b.nr} ${b.bank} ${k.art}`, 60);
    type Teil = { konto: string; betrag: number; text: string; net_amount?: number; tax_rate?: number; tax_amount?: number };
    const teile: Teil[] = k.teilung
      ? (() => {
          const sbv = Math.round(Math.abs(t.amount) * SBV_ANTEIL * 100) / 100;
          const privat = Math.round((Math.abs(t.amount) - sbv) * 100) / 100;
          return [
            { konto: KONTO_SBV, betrag: -sbv, text: k.teilung.sbv },
            { konto: KONTO_PRIVAT, betrag: -privat, text: k.teilung.privat },
          ];
        })()
      : k.nurUst
        ? (() => {
            const ust = Math.round(Math.abs(t.amount) * 100) / 100;
            return [{ konto: k.konto, betrag: t.amount, text: buchungstext, net_amount: k.nurUst.netto, tax_rate: k.nurUst.satz, tax_amount: ust }];
          })()
        : k.mitUst
          ? (() => {
              const brutto = Math.abs(t.amount);
              const netto = Math.round((brutto / (1 + k.mitUst! / 100)) * 100) / 100;
              const ust = Math.round((brutto - netto) * 100) / 100;
              return [
                { konto: KONTO_GEBUEHREN, betrag: -netto, text: buchungstext },
                { konto: KONTO_VST19, betrag: -ust, text: clean(`${buchungstext} USt ${k.mitUst} %`, 60), net_amount: netto, tax_rate: k.mitUst, tax_amount: ust },
              ];
            })()
          : [{ konto: k.konto, betrag: t.amount, text: buchungstext }];
    // Rechnung der Bank liegt schon als Eingangsbeleg vor (gleiche Nummer, gleicher Betrag) -> diesen bezahlen statt Gebühr buchen
    if (k.belegNr) {
      const { data: docs } = await supabase
        .from("incoming_document")
        .select("id, gross_amount")
        .eq("doc_number", k.belegNr)
        .neq("status", "rejected");
      if (docs?.length === 1 && Math.abs(Number(docs[0].gross_amount) - Math.abs(t.amount)) < 0.02) {
        ergebnis.beleg_bezahlt.push(`${t.booking_date} ${t.amount} → Beleg ${k.belegNr}`);
        if (!dryRun) {
          await supabase
            .from("bank_transaction_match")
            .insert({ bank_transaction_id: t.id, incoming_document_id: docs[0].id, amount: t.amount, auto: true });
          await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", t.id);
        }
        continue;
      }
    }
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
        ...(p.net_amount != null ? { net_amount: p.net_amount, tax_rate: p.tax_rate, tax_amount: p.tax_amount } : {}),
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
