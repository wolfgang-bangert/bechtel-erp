import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase";

type Options = { dryRun?: boolean; minCount?: number; minConfidence?: number };

const importsPath = (n: string) => fileURLToPath(new URL(`../../../imports/${n}`, import.meta.url));

type BbPosting = {
  debit_postingaccount_number: string | null;
  credit_postingaccount_number: string | null;
  postingtext: string | null;
  receipts_assigned_counterparties: string | null;
};

const isBankSeite = (n: number) => n >= 1200 && n < 1300; // SKR03 Bank-/Kassenkonten
const isPersonenkonto = (n: number) => n >= 10000 && n < 100000;
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** In BuchhaltungsButler wurden Privatentnahmen (Nutzer-Vorgabe) auf 1900
 *  gebucht statt auf das korrekte Konto 1800 - beim Lernen korrigieren,
 *  nicht den Fehler übernehmen. */
const ACCOUNT_REMAP: Record<string, string> = { "1900": "1800" };

/** BuchhaltungsButler liefert bei manchen Zahlungsdienstleistern die
 *  Gegenseite inkl. angehängter Adresse (z.B. SEPA-Creditor-Name von Tesla-
 *  Ladevorgängen: "Tesla?DE?Supercharger Simon Carmiggeltstraat 1011 DJ
 *  AMSTERDAM 6-50", in mehreren leicht unterschiedlichen Schreibweisen) -
 *  das passt nie exakt zum schlanken counterparty_name aus dem echten
 *  Kontoauszug ("Tesla DE Supercharger"). Bekannte Fälle auf den echten
 *  Namen normalisieren, damit die gelernte Regel später auch greift. */
const COUNTERPARTY_ALIASES: [RegExp, string][] = [[/tesla/i, "Tesla DE Supercharger"]];
function canonicalizeCounterparty(raw: string): string {
  for (const [re, canonical] of COUNTERPARTY_ALIASES) if (re.test(raw)) return canonical;
  return raw;
}

/** Gegenseite aus receipts_assigned_counterparties oder - falls leer, z.B.
 *  bei generischen Bankgebühren-Buchungen - aus dem "... - Gegenseite"-
 *  Suffix des Buchungstexts ableiten. */
function counterpartyOf(p: BbPosting): string | null {
  const direct = p.receipts_assigned_counterparties?.trim();
  if (direct) return direct;
  const text = p.postingtext?.trim() ?? "";
  const idx = text.lastIndexOf(" - ");
  if (idx === -1) return null;
  const tail = text.slice(idx + 3).trim().split("\n")[0];
  return tail || null;
}

const topOf = (m: Map<string, number>): [string, number] =>
  [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/**
 * Lernt aus imports/bb-buchungen.json je Gegenseite (z.B. "Allianz
 * Versicherungs-AG") das am häufigsten bebuchte Sachkonto - für beleglose
 * Bankbuchungen (Skonto, Versicherungen, Leasing, Bankgebühren, ...), wo
 * keine Rechnung/Eingangsrechnung existiert. Nur Buchungen, bei denen genau
 * eine Seite ein Bankkonto ist (SKR03 1200-1299) und keine Seite ein
 * Personenkonto (die sind schon über Standardkonto an der Organisation abgedeckt).
 */
export async function learnBankLedgerRules(opts: Options = {}) {
  const { dryRun = false, minCount = 2, minConfidence = 0.6 } = opts;
  const postings = JSON.parse(readFileSync(importsPath("bb-buchungen.json"), "utf8")) as BbPosting[];

  type Agg = { accounts: Map<string, number>; total: number; texts: Map<string, number>; display: string };
  const byCounterparty = new Map<string, Agg>();

  for (const p of postings) {
    const deb = Number(p.debit_postingaccount_number);
    const cred = Number(p.credit_postingaccount_number);
    if (isPersonenkonto(deb) || isPersonenkonto(cred)) continue;
    const debIsBank = isBankSeite(deb);
    const credIsBank = isBankSeite(cred);
    if (debIsBank === credIsBank) continue; // beide oder keine Bankseite -> nicht eindeutig zuzuordnen
    const rawTarget = debIsBank ? p.credit_postingaccount_number : p.debit_postingaccount_number;
    if (!rawTarget) continue;
    const target = ACCOUNT_REMAP[rawTarget] ?? rawTarget;
    const partnerRaw = counterpartyOf(p);
    if (!partnerRaw) continue;
    const partner = canonicalizeCounterparty(partnerRaw);
    const key = normalize(partner);
    const agg =
      byCounterparty.get(key) ??
      byCounterparty.set(key, { accounts: new Map(), total: 0, texts: new Map(), display: partner }).get(key)!;
    bump(agg.accounts, target);
    agg.total += 1;
    if (p.postingtext) bump(agg.texts, p.postingtext);
  }

  const { data: existingRules } = await supabase.from("bank_ledger_rule").select("counterparty_key, source");
  const existingManual = new Set(
    (existingRules ?? []).filter((r) => r.source === "manual").map((r) => r.counterparty_key),
  );

  const rows: Record<string, unknown>[] = [];
  let matched = 0;
  let skippedManual = 0;

  for (const [key, agg] of byCounterparty) {
    const [account, accCount] = topOf(agg.accounts);
    const conf = agg.total ? Math.round((accCount / agg.total) * 1000) / 1000 : 0;
    if (agg.total < minCount || conf < minConfidence) continue;
    if (existingManual.has(key)) {
      skippedManual += 1;
      continue;
    }
    const [sampleText] = topOf(agg.texts);
    matched += 1;
    rows.push({
      counterparty_key: key,
      counterparty_name: agg.display,
      ledger_account: account,
      sample_postingtext: sampleText || null,
      sample_count: agg.total,
      confidence: conf,
      source: "learned",
      is_active: true,
    });
  }

  if (!dryRun && rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("bank_ledger_rule")
        .upsert(rows.slice(i, i + 500), { onConflict: "counterparty_key" });
      if (error) throw new Error(`bank_ledger_rule upsert: ${error.message}`);
    }
  }

  return {
    dryRun,
    gegenseiten_mit_historie: byCounterparty.size,
    regeln_geschrieben: dryRun ? 0 : matched,
    manuell_beibehalten: skippedManual,
    beispiele: rows.slice(0, 10).map((r) => `${r.counterparty_name} -> ${r.ledger_account} (${r.sample_count}x)`),
  };
}
