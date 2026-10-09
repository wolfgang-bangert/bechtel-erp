import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { debitorPreview, kreditorPreview } from "@/lib/datevPreview";

/**
 * Buchungsjournal für Kontoabruf und Lohn-Auswertung: alle Buchungssätze, die werk kennt, in einer Form
 * (Konto an Gegenkonto, Soll/Haben aus Sicht von `konto`). Quellen:
 *   - Eingangs-/Ausgangsrechnungen: dieselben Sätze wie die DATEV-Vorschau (Brutto mit BU-Schlüssel)
 *   - Bank: Ausbuchungen auf Sachkonten, Skonto, Zahlungsausgleich Debitor/Kreditor (wie datev:zahlungen)
 *   - Lohn: importierter Buchungsstapel des Lohnabrechners
 * Bankbuchungen ohne Zuordnung erscheinen nicht (die fehlen auch im DATEV-Export).
 */
export type Quelle = "eingangsrechnung" | "ausgangsrechnung" | "bank" | "lohn";

export type Buchung = {
  datum: string;
  konto: string;
  gegenkonto: string;
  sh: "S" | "H";
  betrag: number;
  text: string;
  beleg: string;
  quelle: Quelle;
  href: string | null;
  bu?: string;
};

/** Zeile im Kontoauszug: Soll/Haben aus Sicht des abgerufenen Kontos. */
export type AuszugZeile = Buchung & { soll: number; haben: number; saldo: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** PostgREST liefert höchstens 1000 Zeilen je Abfrage - seitenweise laden. */
async function alle<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f, f + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const eins = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function bankBuchungen(sb: SupabaseClient, von: string, bis: string): Promise<Buchung[]> {
  type Tx = { id: string; booking_date: string; amount: number; counterparty_name: string | null; bank_account_id: string };
  type M = {
    id: string;
    amount: number;
    ledger_account: string | null;
    kind: string | null;
    note: string | null;
    bank_transaction_id: string;
    sales_invoice: { invoice_number: string | null; organization: { name: string | null; customer_number: string | null } | null } | null;
    incoming_document: { doc_number: string | null; supplier_name: string | null; organization: { supplier_number: string | null } | null } | null;
  };
  const [konten, txs] = await Promise.all([
    sb.from("bank_account").select("id, ledger_account"),
    alle<Tx>((f, t) =>
      sb
        .from("bank_transaction")
        .select("id, booking_date, amount, counterparty_name, bank_account_id")
        .gte("booking_date", von)
        .lte("booking_date", bis)
        .order("booking_date")
        .range(f, t),
    ),
  ]);
  const geldkonto = new Map((konten.data ?? []).map((k) => [k.id as string, (k.ledger_account as string | null) ?? ""]));
  const txById = new Map(txs.map((t) => [t.id, t]));
  const ids = txs.map((t) => t.id);
  const matches: M[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const teil = ids.slice(i, i + 300);
    matches.push(
      ...(await alle<M>((f, t) =>
        sb
          .from("bank_transaction_match")
          .select(
            "id, amount, ledger_account, kind, note, bank_transaction_id, " +
              "sales_invoice:sales_invoice_id(invoice_number, organization:organization_id(name, customer_number)), " +
              "incoming_document:incoming_document_id(doc_number, supplier_name, organization:supplier_organization_id(supplier_number))",
          )
          .in("bank_transaction_id", teil)
          .range(f, t),
      )),
    );
  }

  const out: Buchung[] = [];
  for (const m of matches) {
    const tx = txById.get(m.bank_transaction_id);
    if (!tx) continue;
    const betrag = Math.abs(r2(m.amount));
    if (betrag < 0.005) continue;
    const si = eins(m.sales_invoice);
    const id = eins(m.incoming_document);
    const siOrg = eins(si?.organization);
    const idOrg = eins(id?.organization);
    const isEingang = si ? true : id ? false : tx.amount >= 0;
    const partnerNr = (si ? siOrg?.customer_number : idOrg?.supplier_number)?.trim() ?? "";
    const partner = (si ? siOrg?.name : id?.supplier_name) ?? tx.counterparty_name ?? "";
    const beleg = (si?.invoice_number ?? id?.doc_number ?? "").trim();
    const geld = geldkonto.get(tx.bank_account_id) ?? "";
    const text = (m.note?.trim() || `${partner} ${beleg}`.trim()).slice(0, 80);
    const basis = { datum: tx.booking_date, betrag, text, beleg, quelle: "bank" as const, href: `/bank?tx=${tx.id}` };

    if (m.ledger_account) {
      if (si || id) {
        // Skonto o. ä. mit Belegbezug: Sachkonto an Debitor/Kreditor
        out.push({ ...basis, konto: m.ledger_account, gegenkonto: partnerNr || partner, sh: isEingang ? "S" : "H" });
      } else {
        // reine Sachkonto-Zeile (Lohn, Durchlaufende Posten, Geldtransit, Gebühren …): Sachkonto an Geldkonto
        out.push({ ...basis, konto: m.ledger_account, gegenkonto: geld, sh: isEingang ? "H" : "S", text: (m.note?.trim() || tx.counterparty_name || "").slice(0, 80) });
      }
    } else if (si || id) {
      // Zahlungsausgleich: Geldkonto an Debitor/Kreditor
      out.push({ ...basis, konto: geld, gegenkonto: partnerNr || partner, sh: isEingang ? "S" : "H" });
    }
  }
  return out;
}

async function lohnBuchungen(sb: SupabaseClient, von: string, bis: string): Promise<Buchung[]> {
  type P = { id: string; amount: number; soll_haben: "S" | "H"; konto: string; gegenkonto: string; bu_schluessel: string | null; beleg_datum: string | null; belegfeld1: string | null; buchungstext: string | null; import_id: string; payroll_import: { period_end: string | null } | null };
  const rows = await alle<P>((f, t) =>
    sb
      .from("payroll_booking")
      .select("id, amount, soll_haben, konto, gegenkonto, bu_schluessel, beleg_datum, belegfeld1, buchungstext, import_id, payroll_import:import_id(period_end)")
      .range(f, t),
  );
  const out: Buchung[] = [];
  for (const p of rows) {
    const datum = p.beleg_datum ?? eins(p.payroll_import)?.period_end ?? null;
    if (!datum || datum < von || datum > bis) continue;
    out.push({
      datum,
      konto: p.konto,
      gegenkonto: p.gegenkonto,
      sh: p.soll_haben,
      betrag: Math.abs(r2(p.amount)),
      text: p.buchungstext ?? "",
      beleg: p.belegfeld1 ?? "",
      quelle: "lohn",
      href: `/lohnbuchungen/${p.import_id}`,
      bu: p.bu_schluessel ?? undefined,
    });
  }
  return out;
}

/** Alle Buchungen im Zeitraum (Datum "YYYY-MM-DD", inklusive). */
export async function ladeJournal(von: string, bis: string, sb?: SupabaseClient): Promise<Buchung[]> {
  const client = sb ?? (await createClient());
  const [kred, deb, bank, lohn] = await Promise.all([
    kreditorPreview(von, bis),
    debitorPreview(von, bis),
    bankBuchungen(client, von, bis),
    lohnBuchungen(client, von, bis),
  ]);
  const ausVorschau = (lines: typeof kred.lines, quelle: Quelle): Buchung[] =>
    lines
      .filter((l) => l.belegdatum)
      .map((l) => ({
        datum: l.belegdatum!,
        konto: l.konto,
        gegenkonto: l.gegenkonto,
        sh: l.sh,
        betrag: Math.abs(r2(l.brutto)),
        text: l.text,
        beleg: l.belegNr ?? "",
        quelle,
        href: l.href,
        bu: l.bu || undefined,
      }));
  return [...ausVorschau(kred.lines, "eingangsrechnung"), ...ausVorschau(deb.lines, "ausgangsrechnung"), ...bank, ...lohn];
}

/** Buchungen aus Sicht eines Kontos: Konto-Seite wie gebucht, Gegenkonto-Seite gespiegelt. */
export function fuerKonto(journal: Buchung[], konto: string): Buchung[] {
  const out: Buchung[] = [];
  for (const b of journal) {
    if (b.konto === konto) out.push(b);
    else if (b.gegenkonto === konto)
      out.push({ ...b, konto, gegenkonto: b.konto, sh: b.sh === "S" ? "H" : "S" });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Kontoauszug mit laufendem Saldo (Soll − Haben); `vortrag` = Saldo vor dem ersten Datum. */
export function kontoauszug(buchungen: Buchung[], vortrag = 0): AuszugZeile[] {
  let saldo = vortrag;
  return buchungen.map((b) => {
    const soll = b.sh === "S" ? b.betrag : 0;
    const haben = b.sh === "H" ? b.betrag : 0;
    saldo = r2(saldo + soll - haben);
    return { ...b, soll, haben, saldo };
  });
}

/** Saldo (Soll − Haben) einer Buchungsliste. */
export const saldoVon = (buchungen: Buchung[]) => r2(buchungen.reduce((s, b) => s + (b.sh === "S" ? b.betrag : -b.betrag), 0));
