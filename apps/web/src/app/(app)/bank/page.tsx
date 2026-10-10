import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { fmtDate, fmtEur } from "@/lib/format";
import {
  MatchForm,
  SpecialMatchForm,
  BelegUploadForm,
  KandidatenListen,
  QuickMatchButton,
  QuickBestellungButton,
  QuickSpecialMatchButton,
  GroupMatchIncomingForm,
  NoteEditForm,
  type Candidate,
} from "./ui";
import { setzeIgnoriert, unmatchTransaction } from "./actions";
import { BankSyncButton } from "./BankSyncButton";
import { BankAvatar, BankNameEdit, BankTransactionsBody, type BankRow } from "./TransactionRow";
import { alleSachkonten } from "@/lib/sachkonten";
import { buchungstextVorschlag } from "@/lib/bank/buchungstext";

const MATCH_STATUS_LABEL: Record<string, string> = {
  unmatched: "offen",
  partial: "teilweise",
  matched: "zugeordnet",
  ignored: "ignoriert",
};

/** Anzeige für Buchungszeilen ohne Sachkonto (reine Notiz, z.B. "sonstige"
 *  aus der Zeit vor der Sachkonto-Anbindung). */
const SONDER_FALLBACK_LABEL: Record<string, string> = {
  sonstige: "Sonstige (ohne Beleg)",
};

/** "Sparkasse" (oder Label als Fallback) + Kontonummer in Klammern - ersetzt
 *  die frühere separate IBAN-Spalte/-Angabe überall auf der Seite. */
const kontoLabel = (a: { label: string; bank_name: string | null; iban: string }) =>
  `${a.bank_name || a.label} (…${a.iban.slice(-6)})`;

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
type Search = { account?: string; hide_matched?: string; q?: string; page?: string; monat?: string; tx?: string };

// "2026-03" -> [2026-03-01, 2026-04-01)
function monthRange(m: string): { from: string; to: string } | null {
  const mt = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(m);
  if (!mt) return null;
  const y = Number(mt[1]);
  const mo = Number(mt[2]);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { from: `${mt[1]}-${mt[2]}-01`, to: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const account = sp.account ?? "";
  // Einzelansicht einer Bankzeile (Direktlink z. B. aus dem Eingangsbeleg): alle anderen Filter ruhen
  const einzelTx = /^[0-9a-f-]{36}$/i.test(sp.tx ?? "") ? (sp.tx as string) : "";
  // Immer alle Status zeigen, nur "zugeordnete ausblenden" als einziger Schalter.
  const hideMatched = sp.hide_matched === "1";
  const q = (sp.q ?? "").trim();
  const monat = sp.monat ?? "";
  const range = monthRange(monat);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const fromRow = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data: allAccounts } = await supabase
    .from("bank_account")
    .select("id, iban, label, bank_name, balance, balance_date, balance_at, is_active, kind")
    .order("label");
  // Darlehenskonten laufen zwar mit über denselben FinTS-Abruf, gehören aber
  // nicht in die Übersicht des laufenden Zahlungsgeschäfts (Nutzer-Wunsch).
  const accounts = (allAccounts ?? []).filter((a) => a.kind !== "darlehen");
  const accountsWithBalance = accounts.filter((a) => a.balance != null);
  const totalBalance = accountsWithBalance.reduce((s, a) => s + Number(a.balance), 0);
  const accountIds = new Set(accounts.map((a) => a.id));

  // Kontenabgleich: je Konto zählen statt einer ungepaginierten Liste zu
  // holen (Supabase kappt sonst bei 1000 Zeilen) - eine kleine Count-Abfrage
  // pro Konto, Anzahl Bankkonten ist überschaubar.
  const openCounts = new Map(
    await Promise.all(
      accounts.map(async (a) => {
        const { count } = await supabase
          .from("bank_transaction")
          .select("id", { count: "exact", head: true })
          .eq("bank_account_id", a.id)
          .in("match_status", ["unmatched", "partial"]);
        return [a.id, count ?? 0] as const;
      }),
    ),
  );
  const totalOpen = [...openCounts.values()].reduce((s, n) => s + n, 0);

  const { data: lastSync } = await supabase
    .from("sync_request")
    .select("status, requested_at, finished_at, error")
    .eq("job", "fints:pull")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type TxRow = {
    id: string;
    booking_date: string;
    value_date: string | null;
    amount: number;
    currency: string;
    counterparty_name: string | null;
    counterparty_iban: string | null;
    purpose: string | null;
    end_to_end_id: string | null;
    bank_ref: string | null;
    match_status: string;
    bank_account: { label: string; bank_name: string | null; iban: string } | null;
    matches: {
      id: string;
      amount: number;
      auto: boolean;
      kind: string | null;
      note: string | null;
      ledger_account: string | null;
      attachment_storage_key: string | null;
      attachment_file_name: string | null;
      sales_invoice: {
        id: string;
        invoice_number: string | null;
        organization: { name: string; customer_number: string | null } | null;
      } | null;
      incoming_document: {
        id: string;
        doc_number: string | null;
        supplier_name: string | null;
        supplier: { supplier_number: string | null } | null;
      } | null;
    }[];
  };

  let query = supabase
    .from("bank_transaction")
    .select(
      "id, booking_date, value_date, amount, currency, counterparty_name, counterparty_iban, purpose, " +
        "end_to_end_id, bank_ref, match_status, " +
        "bank_account:bank_account_id(label, bank_name, iban), " +
        "matches:bank_transaction_match(id, amount, auto, kind, note, ledger_account, " +
        "attachment_storage_key, attachment_file_name, " +
        "sales_invoice:sales_invoice(id, invoice_number, organization:organization(name, customer_number)), " +
        "incoming_document:incoming_document(id, doc_number, supplier_name, " +
        "supplier:supplier_organization_id(supplier_number)))",
      { count: "exact" },
    );
  // Gleiche Filter für die Liste und die Summenzeile (alle Seiten, nicht nur die angezeigte).
  const applyFilters = <T extends { eq: Function; in: Function; neq: Function; or: Function; gte: Function; lt: Function }>(qb: T): T => {
    let r = qb;
    if (einzelTx) return r.eq("id", einzelTx) as T;
    // Nur echte Girokonten - Darlehenskonten (accountIds enthält sie nicht)
    // dürfen auch über einen von Hand gebauten ?account=-Link nicht auftauchen.
    if (account && accountIds.has(account)) r = r.eq("bank_account_id", account);
    else r = r.in("bank_account_id", [...accountIds]);
    if (hideMatched) r = r.in("match_status", ["unmatched", "partial"]);
    if (range) r = r.gte("booking_date", range.from).lt("booking_date", range.to);
    if (q) {
      const like = `%${q.replace(/[%,]/g, "")}%`;
      const filters = [`counterparty_name.ilike.${like}`, `purpose.ilike.${like}`];
      // Zahl eingegeben (mit Komma oder Punkt) → auch auf den Betrag matchen,
      // Vorzeichen ignorieren (Nutzer weiß bei Suche oft nicht, ob Soll/Haben).
      const num = q.replace(".", "").replace(",", ".");
      if (/^-?\d+(\.\d{1,2})?$/.test(num)) {
        const n = Number(num);
        filters.push(`amount.eq.${n}`, `amount.eq.${-n}`);
      }
      r = r.or(filters.join(","));
    }
    return r;
  };
  query = applyFilters(query);

  // Summen der gefilterten Umsätze (Eingänge/Ausgänge) über alle Seiten
  let sumIn = 0;
  let sumOut = 0;
  for (let from = 0; ; from += 1000) {
    const { data: amts } = await applyFilters(
      supabase.from("bank_transaction").select("amount").range(from, from + 999),
    );
    for (const r of (amts ?? []) as { amount: number }[]) {
      if (Number(r.amount) >= 0) sumIn += Number(r.amount);
      else sumOut += Number(r.amount);
    }
    if ((amts ?? []).length < 1000) break;
  }

  const res = await query
    .order("booking_date", { ascending: false })
    .range(fromRow, fromRow + PAGE_SIZE - 1);
  const error = res.error;
  const count = res.count;
  const data = (res.data ?? []) as unknown as TxRow[];

  const { data: ledgerAccountRows } = await alleSachkonten(supabase, "number, name", true);
  const ledgerAccounts = (ledgerAccountRows ?? []).map((a) => ({
    value: a.number,
    label: `${a.number} – ${a.name}`,
  }));
  const ledgerAccountName = new Map(ledgerAccounts.map((a) => [a.value, a.label]));

  // Aus der BuchhaltungsButler-Historie gelernte Sachkonto-Vorschläge je
  // Gegenseite (siehe learnBankRules.ts) - für die Sonderbuchung-Vorbelegung.
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const stripLegalForm = (s: string) => s.replace(/\b(gmbh|ag|kg|co|mbh|ug|e\.?k\.?|ohg)\b/g, "").trim();
  const counterpartyKeys = [
    ...new Set(data.map((t) => t.counterparty_name).filter((n): n is string => !!n).map(normalize)),
  ];
  const { data: bankLedgerRules } = counterpartyKeys.length
    ? await supabase
        .from("bank_ledger_rule")
        .select("counterparty_key, ledger_account, sample_postingtext")
        .in("counterparty_key", counterpartyKeys)
        .eq("is_active", true)
    : { data: [] as { counterparty_key: string; ledger_account: string; sample_postingtext: string | null }[] };
  const bankLedgerRuleByKey = new Map((bankLedgerRules ?? []).map((r) => [r.counterparty_key, r]));

  // Bankgebühren/Zinsen (Sollzinsen, Kontoauszugs-/EBICS-Gebühren, Abschluss-
  // Abrechnungen, ...) tragen im Kontoauszug oft gar keine Gegenseite - die
  // Buchung lief historisch in BuchhaltungsButler trotzdem unter dem Namen
  // der eigenen Bank selbst (z.B. "Oberbank AG"). Fallback: fehlt die
  // Gegenseite, wird stattdessen (großzügig, ohne Rechtsform) gegen den
  // Banknamen des Kontos selbst geprüft.
  const bankNameKeys = [
    ...new Set(accounts.map((a) => stripLegalForm(normalize(a.bank_name || a.label))).filter((s) => s.length >= 4)),
  ];
  const { data: bankNameRules } = bankNameKeys.length
    ? await supabase
        .from("bank_ledger_rule")
        .select("counterparty_key, ledger_account, sample_postingtext")
        .eq("is_active", true)
    : { data: [] as { counterparty_key: string; ledger_account: string; sample_postingtext: string | null }[] };
  const bankNameRuleCache = new Map<string, { ledger_account: string; sample_postingtext: string | null } | null>();
  const ruleForBankName = (name: string | null | undefined) => {
    const key = stripLegalForm(normalize(name ?? ""));
    if (key.length < 4) return undefined;
    if (bankNameRuleCache.has(key)) return bankNameRuleCache.get(key) ?? undefined;
    // Exakte Übereinstimmung nach Rechtsform-Entfernung, nicht "enthält" -
    // sonst trifft z.B. der Bankname "Oberbank" auch auf einen völlig
    // anderen Kreditor wie "Oberbank Leasing GmbH Bayern".
    const hit = (bankNameRules ?? []).find((r) => stripLegalForm(r.counterparty_key) === key);
    bankNameRuleCache.set(key, hit ?? null);
    return hit;
  };

  const attachmentUrls = new Map<string, string>(
    await Promise.all(
      data
        .flatMap((t) => t.matches ?? [])
        .filter((m) => m.attachment_storage_key)
        .map(
          async (m) =>
            [m.id, (await signedGetUrl(m.attachment_storage_key as string, 1800)) ?? ""] as [string, string],
        ),
    ),
  );

  // Skonto-Buchungszeilen (ledger_account + Beleg-Link auf derselben Zeile,
  // siehe skontoApply) sind kein zusätzliches Bank-Bargeld - sie hängen nur
  // zur Übersicht am selben Umsatz, schließen aber die Rechnung über den
  // schon vorhandenen vollen Zahlungs-Match hinweg. Für "wie viel von diesem
  // Bankumsatz ist bereits zugeordnet" dürfen sie nicht mitgezählt werden,
  // sonst wird der Umsatz um genau den Skontobetrag überallokiert.
  const isCashMatch = (m: TxRow["matches"][number]) =>
    !(m.ledger_account && (m.sales_invoice || m.incoming_document));

  // Gemeinsame Kandidatenlisten (einmal je Seite, von allen Zeilen genutzt).
  const alloc = (t: TxRow) =>
    (t.matches ?? []).filter(isCashMatch).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0);
  const hasCredits = data.some((t) => t.amount > 0 && Math.abs(t.amount) - alloc(t) > 0.01);
  const hasDebits = data.some((t) => t.amount < 0 && Math.abs(t.amount) - alloc(t) > 0.01);

  const cents = (n: number | null | undefined) => Math.round(Math.abs(n ?? 0) * 100);
  // pro Centbetrag genau ein eindeutiger Vorschlag (Label) → wird vorausgefüllt
  const uniqueByAmount = (rows: { c: number; label: string }[]) => {
    const seen = new Map<number, string | null>();
    for (const r of rows) seen.set(r.c, seen.has(r.c) ? null : r.label);
    return seen;
  };

  // Firmenname ohne Rechtsform/Satzzeichen, für den Abgleich Gegenseite ↔ Lieferant/Organisation
  const namensKern = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(gmbh|mbh|ag|kg|co|ug|ohg|gbr|se|sas|sarl|s\.?a\.?|ltd|inc|llc|e\.?\s?k\.?|aktiengesellschaft|gruppe|group)\b\.?/g, " ")
      .replace(/[^a-z0-9äöüß]+/g, " ")
      .trim();
  const gleicherName = (a: string, b: string) => {
    if (!a || !b) return false;
    const wa = a.split(" ").filter((w) => w.length > 2);
    const wb = b.split(" ").filter((w) => w.length > 2);
    return wa.length > 0 && wb.length > 0 && (a === b || wa[0] === wb[0]);
  };
  /**
   * Mehrere offene Rechnungen mit demselben Betrag (z. B. monatliches Abo): die des passenden Lieferanten,
   * und davon die jüngste mit Belegdatum bis 5 Tage nach der Buchung (sonst die älteste offene).
   */
  const erVorschlagLieferant = (gegenseite: string | null, buchung: string, c: number, zweck: string | null): string | undefined => {
    const kern = namensKern(gegenseite ?? "");
    const treffer = erRows.filter((r) => r.c === c && gleicherName(kern, r.lieferant));
    if (!treffer.length) return undefined;
    // Rechnungsnummer im Verwendungszweck hat Vorrang (z. B. Leasing zahlt die Rechnung des Vormonats)
    const z = (zweck ?? "").replace(/\s+/g, "");
    const perNummer = treffer.find((r) => r.nummer.length >= 4 && z.includes(r.nummer.replace(/\s+/g, "")));
    if (perNummer) return perNummer.label;
    const grenze = new Date(new Date(buchung).getTime() + 5 * 86400000).toISOString().slice(0, 10);
    const vorher = treffer.filter((r) => (r.datum ?? "") <= grenze).sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""));
    const t = vorher[0] ?? [...treffer].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""))[0];
    return t?.label;
  };

  // Vorkontierung der Organisationen (Aufwandskonto) als Sachkonto-Vorschlag für Bankzeilen ohne Rechnung/Regel
  const vkOrgs: { name: string; default_expense_account: string | null }[] = [];
  for (let f = 0; ; f += 1000) {
    const { data: o } = await supabase
      .from("organization")
      .select("name, default_expense_account")
      .not("default_expense_account", "is", null)
      .range(f, f + 999);
    vkOrgs.push(...((o ?? []) as typeof vkOrgs));
    if (!o || o.length < 1000) break;
  }
  const vkByKern = new Map<string, string>();
  for (const o of vkOrgs) {
    const k = namensKern(o.name);
    if (k && o.default_expense_account) vkByKern.set(k, o.default_expense_account);
  }
  const vorkontierungFuer = (gegenseite: string) => {
    const k = namensKern(gegenseite);
    // Lieferant hat offene Rechnungen → die Bankzeile gehört zu einer Rechnung, nicht direkt aufs Konto (sonst doppelt)
    if (erRows.some((r) => gleicherName(k, r.lieferant))) return undefined;
    let konto = vkByKern.get(k);
    if (!konto) for (const [kk, v] of vkByKern) if (gleicherName(k, kk)) { konto = v; break; }
    return konto ? { counterparty_key: k, ledger_account: konto, sample_postingtext: null as string | null } : undefined;
  };

  // Bestellnummern im Verwendungszweck (Amazon "305-7818498-7269112") → offene Rechnungen mit dieser Bestellnummer
  const BESTELLNR = /\b\d{3}-\d{7}-\d{7}\b/g;
  const bestellNrSeite = [...new Set(data.flatMap((t) => (t.purpose ?? "").match(BESTELLNR) ?? []))];
  const docsJeBestellung = new Map<string, { id: string; label: string; offen: number }[]>();
  if (bestellNrSeite.length) {
    const { data: bd } = await supabase
      .from("incoming_document")
      .select("id, doc_number, doc_date, open_amount, supplier_name, bestellnummern")
      .overlaps("bestellnummern", bestellNrSeite)
      .neq("status", "rejected")
      .in("payment_status", ["open", "partly_paid"])
      .gt("open_amount", 0);
    for (const d of (bd ?? []) as { id: string; doc_number: string | null; doc_date: string | null; open_amount: number; supplier_name: string | null; bestellnummern: string[] }[]) {
      for (const nr of d.bestellnummern ?? []) {
        if (!bestellNrSeite.includes(nr)) continue;
        docsJeBestellung.set(nr, [
          ...(docsJeBestellung.get(nr) ?? []),
          { id: d.id, label: `${d.doc_number ?? "?"} — ${d.supplier_name ?? "?"} — vom ${fmtDate(d.doc_date)} — ${fmtEur(d.open_amount)}`, offen: Number(d.open_amount) },
        ]);
      }
    }
  }
  const bestellVorschlag = (zweck: string | null) => {
    for (const nr of (zweck ?? "").match(BESTELLNR) ?? []) {
      const d = docsJeBestellung.get(nr);
      if (d?.length) return { nr, docs: d };
    }
    return undefined;
  };

  let arCandidates: Candidate[] = [];
  let arPrefill = new Map<number, string | null>();
  if (hasCredits) {
    const { data: inv } = await supabase
      .from("sales_invoice")
      .select("invoice_number, invoice_date, open_amount, organization:organization(name)")
      .eq("kind", "invoice")
      .in("payment_status", ["open", "partly_paid"])
      .gt("open_amount", 0)
      .not("invoice_number", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(800);
    const rows = ((inv ?? []) as unknown as {
      invoice_number: string;
      invoice_date: string | null;
      open_amount: number | null;
      organization: { name: string } | null;
    }[]).map((i) => ({
      number: i.invoice_number,
      amount: i.open_amount,
      label: `${i.invoice_number} — ${
        (i.organization as unknown as { name: string } | null)?.name ?? "?"
      } — vom ${fmtDate(i.invoice_date)} — ${fmtEur(i.open_amount)}`,
    }));
    arCandidates = rows.map(({ number, label }) => ({ number, label }));
    arPrefill = uniqueByAmount(rows.map((r) => ({ c: cents(r.amount), label: r.label })));
  }

  let erCandidates: Candidate[] = [];
  let erPrefill = new Map<number, string | null>();
  // für die Wahl bei mehreren gleich hohen offenen Rechnungen: Lieferant + Belegdatum
  let erRows: { label: string; c: number; datum: string | null; lieferant: string; nummer: string }[] = [];
  if (hasDebits) {
    const { data: inc } = await supabase
      .from("incoming_document")
      .select("doc_number, doc_date, open_amount, supplier_name")
      .in("doc_type", ["invoice", "credit_note"])
      .neq("status", "rejected")
      .in("payment_status", ["open", "partly_paid"])
      .gt("open_amount", 0)
      .not("doc_number", "is", null)
      .order("doc_date", { ascending: false })
      .limit(800);
    const rows = ((inc ?? []) as unknown as {
      doc_number: string;
      doc_date: string | null;
      open_amount: number | null;
      supplier_name: string | null;
    }[]).map((i) => ({
      number: i.doc_number,
      amount: i.open_amount,
      label: `${i.doc_number} — ${i.supplier_name ?? "?"} — vom ${fmtDate(i.doc_date)} — ${fmtEur(i.open_amount)}`,
    }));
    erCandidates = rows.map(({ number, label }) => ({ number, label }));
    erPrefill = uniqueByAmount(rows.map((r) => ({ c: cents(r.amount), label: r.label })));
    erRows = ((inc ?? []) as unknown as { doc_date: string | null; supplier_name: string | null }[]).map((i, k) => ({
      label: rows[k].label,
      c: cents(rows[k].amount),
      datum: i.doc_date,
      lieferant: namensKern(i.supplier_name ?? ""),
      nummer: rows[k].number,
    }));
  }

  // Kreditkarten-/PayPal-Belege: landen nicht einzeln auf dem Kontoauszug,
  // sondern gebündelt in einer Sammelabrechnung - eigene Kandidatenliste für
  // das gruppierte Zuordnen (mehrere Belege gegen eine Bankzeile).
  let cardCandidates: { id: string; label: string; amount: number }[] = [];
  if (hasDebits) {
    const { data: cc } = await supabase
      .from("incoming_document")
      .select("id, doc_number, doc_date, open_amount, supplier_name, payment_method")
      .in("payment_method", ["card", "paypal"])
      .neq("status", "rejected")
      .in("payment_status", ["open", "partly_paid"])
      .gt("open_amount", 0)
      .order("doc_date", { ascending: false })
      .limit(300);
    cardCandidates = (cc ?? []).map((d) => ({
      id: d.id,
      amount: d.open_amount ?? 0,
      label:
        `${d.payment_method === "card" ? "💳" : "🅿️"} ${fmtDate(d.doc_date)} · ` +
        `${d.doc_number ?? "?"} — ${d.supplier_name ?? "?"} — ${fmtEur(d.open_amount)}`,
    }));
  }

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (account) u.set("account", account);
    if (hideMatched) u.set("hide_matched", "1");
    if (range) u.set("monat", monat);
    if (q) u.set("q", q);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/bank?${s}` : "/bank";
  };

  const rows: BankRow[] = data.map((tx) => {
    const matches = tx.matches ?? [];
    const side = tx.amount > 0 ? "debitor" : "kreditor";
    const allocated =
      Math.round(matches.filter(isCashMatch).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0) * 100) / 100;
    const remaining = Math.round((Math.abs(tx.amount) - allocated) * 100) / 100;
    const prefill =
      (side === "debitor" ? arPrefill : erPrefill).get(cents(remaining)) ??
      (side === "kreditor" ? erVorschlagLieferant(tx.counterparty_name, tx.booking_date, cents(remaining), tx.purpose) : undefined) ??
      undefined;
    // Für wiederkehrende Sachkonto-Buchungen ohne Rechnung (Leasing, Miete,
    // Bankgebühren, ...): aus der BuchhaltungsButler-Historie gelernter
    // Sachkonto-Vorschlag direkt als Ein-Klick-Button in der Liste, wie bei
    // Rechnungsnummern - sonst blieb der Vorschlag im Detail-Popup versteckt.
    const bankName = tx.bank_account?.bank_name || tx.bank_account?.label || "?";
    const ledgerRule =
      (tx.counterparty_name ? bankLedgerRuleByKey.get(normalize(tx.counterparty_name)) : ruleForBankName(bankName)) ??
      // keine Regel: Vorkontierung (Aufwandskonto) der Organisation zur Gegenseite – nur Ausgänge ohne Rechnung
      (tx.amount < 0 && tx.counterparty_name ? vorkontierungFuer(tx.counterparty_name) : undefined);

    return {
      key: tx.id,
      title: `${fmtDate(tx.booking_date)} · ${fmtEur(tx.amount)} · ${tx.counterparty_name ?? "–"}`,
      cols: [
        <BankAvatar key="a" name={bankName} />,
        fmtDate(tx.booking_date),
        <span key="b" className={tx.amount < 0 ? "msg-err" : ""}>
          {fmtEur(tx.amount)}
        </span>,
        <div key="g" style={{ maxWidth: 320 }}>
          <div className="wrap" style={{ fontSize: 14, fontWeight: 600 }}>
            {tx.counterparty_name ?? "–"}
          </div>
          <div
            className="count"
            style={{
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={tx.purpose ?? undefined}
          >
            {tx.purpose ?? "–"}
          </div>
        </div>,
        <span key="s" className="tag">
          {MATCH_STATUS_LABEL[tx.match_status] ?? tx.match_status}
        </span>,
        remaining > 0.01 && side === "kreditor" && bestellVorschlag(tx.purpose) ? (
          <QuickBestellungButton
            key="v"
            txId={tx.id}
            bestellnummer={bestellVorschlag(tx.purpose)!.nr}
            docs={bestellVorschlag(tx.purpose)!.docs}
          />
        ) : remaining > 0.01 && prefill ? (
          <QuickMatchButton key="v" txId={tx.id} side={side} suggestion={prefill} />
        ) : remaining > 0.01 && ledgerRule ? (
          <QuickSpecialMatchButton
            key="v"
            txId={tx.id}
            ledgerAccount={ledgerRule.ledger_account}
            ledgerLabel={ledgerAccountName.get(ledgerRule.ledger_account) ?? ledgerRule.ledger_account}
            amount={remaining}
            note={ledgerRule.sample_postingtext || buchungstextVorschlag(tx.counterparty_name, tx.purpose)}
          />
        ) : (
          <span key="v" />
        ),
      ],
      children: (
        <div className="rows" style={{ gap: 18 }}>
          <dl className="kv">
            <dt>Buchungsdatum</dt>
            <dd>{fmtDate(tx.booking_date)}</dd>
            <dt>Wertstellung</dt>
            <dd>{tx.value_date ? fmtDate(tx.value_date) : "—"}</dd>
            <dt>Betrag</dt>
            <dd className={tx.amount < 0 ? "msg-err" : ""} style={{ fontWeight: 600 }}>
              {fmtEur(tx.amount)} {tx.currency}
            </dd>
            <dt>Konto</dt>
            <dd>{bankName}</dd>
            <dt>Gegenseite</dt>
            <dd>{tx.counterparty_name ?? "—"}</dd>
            <dt>IBAN Gegenseite</dt>
            <dd>{tx.counterparty_iban ?? "—"}</dd>
            <dt>Verwendungszweck</dt>
            <dd className="wrap">{tx.purpose ?? "—"}</dd>
            <dt>End-to-End-Referenz</dt>
            <dd>{tx.end_to_end_id ?? "—"}</dd>
            <dt>Bankreferenz</dt>
            <dd>{tx.bank_ref ?? "—"}</dd>
            <dt>Status</dt>
            <dd>
              <span className="tag">{MATCH_STATUS_LABEL[tx.match_status] ?? tx.match_status}</span>
            </dd>
          </dl>

          <div>
            <h2 style={{ margin: "0 0 8px" }}>Buchungen</h2>
            {matches.length > 0 ? (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Beleg</th>
                      <th>Buchungstext</th>
                      <th>Gegenkonto</th>
                      <th style={{ textAlign: "right" }}>Betrag</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => {
                      const inc = m.incoming_document;
                      const inv = m.sales_invoice;
                      let beleg: React.ReactNode;
                      if (inc) {
                        beleg = (
                          <Link href={`/eingangsrechnungen/${inc.id}`}>
                            {inc.doc_number ?? "Eingangsbeleg"}
                            {inc.supplier_name ? ` — ${inc.supplier_name}` : ""}
                          </Link>
                        );
                      } else if (inv) {
                        beleg = (
                          <Link href={`/rechnungen/${inv.id}`}>
                            {inv.invoice_number ?? "Rechnung"}
                            {inv.organization?.name ? ` — ${inv.organization.name}` : ""}
                          </Link>
                        );
                      } else {
                        const attUrl = attachmentUrls.get(m.id);
                        beleg = attUrl ? (
                          <a href={attUrl} target="_blank" rel="noreferrer">
                            📎 {m.attachment_file_name ?? "Beleg"}
                          </a>
                        ) : (
                          <span className="count">—</span>
                        );
                      }
                      // Sachkonto hat Vorrang (z.B. Skonto zu einer
                      // Rechnung: Beleg zeigt die Rechnung, Gegenkonto
                      // trotzdem das Skontokonto, nicht "Debitor").
                      const gegenkonto: React.ReactNode = m.ledger_account
                        ? (ledgerAccountName.get(m.ledger_account) ?? m.ledger_account)
                        : inc
                          ? inc.supplier?.supplier_number
                            ? `Kreditor ${inc.supplier.supplier_number}`
                            : "Verbindlichkeiten"
                          : inv
                            ? inv.organization?.customer_number
                              ? `Debitor ${inv.organization.customer_number}`
                              : "Forderungen"
                            : (SONDER_FALLBACK_LABEL[m.kind ?? ""] ?? m.kind ?? "—");
                      return (
                        <tr key={m.id}>
                          <td>
                            {beleg} {m.auto && <span className="tag">auto</span>}
                          </td>
                          <td style={{ minWidth: 200 }}>
                            <NoteEditForm matchId={m.id} note={m.note} />
                          </td>
                          <td className="count">{gegenkonto}</td>
                          <td style={{ textAlign: "right" }}>{fmtEur(m.amount)}</td>
                          <td style={{ textAlign: "right" }}>
                            <form action={unmatchTransaction}>
                              <input type="hidden" name="match_id" value={m.id} />
                              <input type="hidden" name="tx_id" value={tx.id} />
                              <button className="ghost" style={{ padding: "2px 8px" }}>
                                aufheben
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="count" style={{ margin: 0 }}>
                Noch keine Buchung.
              </p>
            )}
          </div>

          <div
            className="row"
            style={{ justifyContent: "space-between", padding: "8px 12px", fontWeight: 600 }}
          >
            <span>Saldo</span>
            <span className={remaining > 0.01 ? "msg-err" : "msg-ok"} style={{ fontSize: 15 }}>
              {fmtEur(remaining)} {remaining <= 0.01 ? "· ausgebucht ✓" : "· offen"}
            </span>
          </div>

          {tx.matches.length === 0 && (
            <form action={setzeIgnoriert} style={{ margin: "6px 0" }}>
              <input type="hidden" name="tx_id" value={tx.id} />
              <input type="hidden" name="ignorieren" value={tx.match_status === "ignored" ? "0" : "1"} />
              <button className="ghost" style={{ padding: "2px 10px" }} title="Info-Zeile ohne Buchung (z. B. 0,00 € von der Bank): zählt nicht mehr als offen">
                {tx.match_status === "ignored" ? "wieder aufnehmen" : "ignorieren (keine Buchung nötig)"}
              </button>
            </form>
          )}

          {remaining > 0.01 && tx.match_status !== "ignored" && (
            <div className="rows" style={{ gap: 8 }}>
              <MatchForm
                txId={tx.id}
                side={side}
                listId={side === "kreditor" ? "er-list" : "ar-list"}
                defaultValue={prefill}
                showAmount
                remaining={remaining}
                hint={
                  `${tx.counterparty_name ?? ""} — ` +
                  (side === "kreditor" ? "ER-Nr./Lieferant" : "Rg-Nr./Kunde")
                }
              />
              {side === "kreditor" && cardCandidates.length > 0 && (
                <GroupMatchIncomingForm txId={tx.id} targetAmount={remaining} candidates={cardCandidates} />
              )}
              <SpecialMatchForm
                txId={tx.id}
                remaining={remaining}
                ledgerAccounts={ledgerAccounts}
                suggestion={ledgerRule}
                textVorschlag={buchungstextVorschlag(tx.counterparty_name, tx.purpose)}
              />
              <BelegUploadForm txId={tx.id} remaining={remaining} />
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <KandidatenListen listen={{ "ar-list": arCandidates, "er-list": erCandidates }}>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Bank</h1>
        <BankSyncButton last={lastSync ?? null} />
      </div>
      <p className="lead">
        Importierte Kontoumsätze. <strong>Gutschriften</strong> → Ausgangsrechnung,
        <strong> Abgänge</strong> → Eingangsrechnung. Der Rest folgt automatisch
        beim nächsten <code>bank:match</code>.
      </p>

      {einzelTx && (
        <div className="lead" style={{ marginBottom: 12, padding: "8px 12px", background: "var(--bd-surface-2, #f3f3f3)", borderRadius: 6 }}>
          Einzelne Bankzeile. Die Zuordnung hebst du in der Zeile unten auf („aufheben“).{" "}
          <a className="bd-link" href="/bank">alle Bankzeilen anzeigen</a>
        </div>
      )}

      {(accounts ?? []).length === 0 && (
        <div className="banner-err">
          Noch keine Kontobewegungen importiert. CLI:{" "}
          <code>pnpm --filter sync bank:import --file=auszug.xml</code>
        </div>
      )}

      {(accounts ?? []).length > 0 && (
        <div className="table-scroll" style={{ marginBottom: 14 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Konto</th>
                <th style={{ textAlign: "right" }}>Kontostand</th>
                <th>Stand</th>
                <th style={{ textAlign: "right" }}>offene Umsätze</th>
              </tr>
            </thead>
            <tbody>
              {(accounts ?? []).map((a) => {
                const open = openCounts.get(a.id) ?? 0;
                return (
                  <tr key={a.id}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <BankAvatar name={a.bank_name || a.label} />
                        <Link href={`/bank?account=${a.id}`}>{kontoLabel(a)}</Link>
                        <BankNameEdit accountId={a.id} bankName={a.bank_name} />
                      </span>
                    </td>
                    <td
                      style={{ textAlign: "right", fontWeight: 600 }}
                      className={a.balance != null && Number(a.balance) < 0 ? "msg-err" : ""}
                    >
                      {a.balance != null ? fmtEur(Number(a.balance)) : "—"}
                    </td>
                    <td className="count">
                      {a.balance_date
                        ? fmtDate(a.balance_date)
                        : a.balance == null
                          ? "beim nächsten Abruf"
                          : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {open > 0 ? (
                        <Link className="msg-err" href={`/bank?account=${a.id}&hide_matched=1`}>
                          {open} offen
                        </Link>
                      ) : (
                        <span className="msg-ok">alle zugeordnet ✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {accountsWithBalance.length > 1 && (
                <tr>
                  <td style={{ fontWeight: 700 }}>Summe</td>
                  <td
                    style={{ textAlign: "right", fontWeight: 700 }}
                    className={totalBalance < 0 ? "msg-err" : ""}
                  >
                    {fmtEur(totalBalance)}
                  </td>
                  <td />
                  <td style={{ textAlign: "right", fontWeight: 700 }} className={totalOpen > 0 ? "msg-err" : "msg-ok"}>
                    {totalOpen > 0 ? `${totalOpen} offen` : "alle zugeordnet ✓"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <form className="toolbar" method="get">
        <select name="account" defaultValue={account}>
          <option value="">alle Konten</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {kontoLabel(a)}
            </option>
          ))}
        </select>
        <input type="month" name="monat" defaultValue={range ? monat : ""} title="Monat (Buchungsdatum)" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Gegenseite, Verwendungszweck, Betrag…"
          style={{ minWidth: 260 }}
        />
        <label className="chk">
          <input type="checkbox" name="hide_matched" value="1" defaultChecked={hideMatched} /> erledigte
          (zugeordnete/ignorierte) ausblenden
        </label>
        <button type="submit">Anzeigen</button>
        {(account || hideMatched || q || range) && <Link href="/bank">zurücksetzen</Link>}
        <span className="count">
          {total.toLocaleString("de-DE")} Umsätze · Eingänge {fmtEur(sumIn)} · Ausgänge {fmtEur(sumOut)}
        </span>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}


      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th />
              <th>Datum</th>
              <th style={{ textAlign: "right" }}>Betrag</th>
              <th>Gegenseite / Verwendungszweck</th>
              <th>Status</th>
              <th style={{ minWidth: 220 }}>Vorschlag</th>
            </tr>
          </thead>
          <BankTransactionsBody rows={rows} />
        </table>
      </div>

      {lastPage > 1 && (
        <div className="pager">
          {page > 1 ? <Link className="ghost" href={href(page - 1)}>← zurück</Link> : <span className="nav-disabled">← zurück</span>}
          <span className="count">Seite {page} / {lastPage}</span>
          {page < lastPage ? <Link className="ghost" href={href(page + 1)}>weiter →</Link> : <span className="nav-disabled">weiter →</span>}
        </div>
      )}
    </KandidatenListen>
  );
}
