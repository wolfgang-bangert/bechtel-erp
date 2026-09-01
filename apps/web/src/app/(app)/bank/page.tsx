import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { MatchForm, InvoiceDatalist, type Candidate } from "./ui";
import { unmatchTransaction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
type Search = { account?: string; status?: string; page?: string };

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const account = sp.account ?? "";
  const status = sp.status ?? "unmatched";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const fromRow = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("bank_account")
    .select("id, iban, label")
    .order("label");

  type TxRow = {
    id: string;
    booking_date: string;
    amount: number;
    counterparty_name: string | null;
    purpose: string | null;
    match_status: string;
    matches: {
      id: string;
      amount: number;
      auto: boolean;
      sales_invoice: { id: string; invoice_number: string | null } | null;
      incoming_document: { id: string; doc_number: string | null } | null;
    }[];
  };

  let query = supabase
    .from("bank_transaction")
    .select(
      "id, booking_date, amount, counterparty_name, purpose, match_status, " +
        "matches:bank_transaction_match(id, amount, auto, " +
        "sales_invoice:sales_invoice(id, invoice_number), " +
        "incoming_document:incoming_document(id, doc_number))",
      { count: "exact" },
    );
  if (account) query = query.eq("bank_account_id", account);
  // "offen" zeigt auch teilweise zugeordnete (Sammelzahlungen), damit man
  // dort weitere Rechnungen anhängen kann.
  if (status === "unmatched") query = query.in("match_status", ["unmatched", "partial"]);
  else if (status) query = query.eq("match_status", status);

  const res = await query
    .order("booking_date", { ascending: false })
    .range(fromRow, fromRow + PAGE_SIZE - 1);
  const error = res.error;
  const count = res.count;
  const data = (res.data ?? []) as unknown as TxRow[];

  // Gemeinsame Kandidatenlisten (einmal je Seite, von allen Zeilen genutzt).
  const alloc = (t: TxRow) =>
    (t.matches ?? []).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0);
  const hasCredits = data.some((t) => t.amount > 0 && Math.abs(t.amount) - alloc(t) > 0.01);
  const hasDebits = data.some((t) => t.amount < 0 && Math.abs(t.amount) - alloc(t) > 0.01);

  const cents = (n: number | null | undefined) => Math.round(Math.abs(n ?? 0) * 100);
  // pro Centbetrag genau ein eindeutiger Vorschlag (Label) → wird vorausgefüllt
  const uniqueByAmount = (rows: { c: number; label: string }[]) => {
    const seen = new Map<number, string | null>();
    for (const r of rows) seen.set(r.c, seen.has(r.c) ? null : r.label);
    return seen;
  };

  let arCandidates: Candidate[] = [];
  let arPrefill = new Map<number, string | null>();
  if (hasCredits) {
    const { data: inv } = await supabase
      .from("sales_invoice")
      .select("invoice_number, open_amount, organization:organization(name)")
      .eq("kind", "invoice")
      .in("payment_status", ["open", "partly_paid"])
      .gt("open_amount", 0)
      .not("invoice_number", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(800);
    const rows = ((inv ?? []) as unknown as {
      invoice_number: string;
      open_amount: number | null;
      organization: { name: string } | null;
    }[]).map((i) => ({
      number: i.invoice_number,
      amount: i.open_amount,
      label: `${i.invoice_number} — ${
        (i.organization as unknown as { name: string } | null)?.name ?? "?"
      } — ${fmtEur(i.open_amount)}`,
    }));
    arCandidates = rows.map(({ number, label }) => ({ number, label }));
    arPrefill = uniqueByAmount(rows.map((r) => ({ c: cents(r.amount), label: r.label })));
  }

  let erCandidates: Candidate[] = [];
  let erPrefill = new Map<number, string | null>();
  if (hasDebits) {
    const { data: inc } = await supabase
      .from("incoming_document")
      .select("doc_number, gross_amount, supplier_name")
      .in("doc_type", ["invoice", "credit_note"])
      .eq("payment_status", "open")
      .not("doc_number", "is", null)
      .order("doc_date", { ascending: false })
      .limit(800);
    const rows = ((inc ?? []) as unknown as {
      doc_number: string;
      gross_amount: number | null;
      supplier_name: string | null;
    }[]).map((i) => ({
      number: i.doc_number,
      amount: i.gross_amount,
      label: `${i.doc_number} — ${i.supplier_name ?? "?"} — ${fmtEur(i.gross_amount)}`,
    }));
    erCandidates = rows.map(({ number, label }) => ({ number, label }));
    erPrefill = uniqueByAmount(rows.map((r) => ({ c: cents(r.amount), label: r.label })));
  }

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (account) u.set("account", account);
    if (status) u.set("status", status);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/bank?${s}` : "/bank";
  };

  return (
    <>
      <h1>Bank</h1>
      <p className="lead">
        Importierte Kontoumsätze. <strong>Gutschriften</strong> → Ausgangsrechnung,
        <strong> Abgänge</strong> → Eingangsrechnung. Der Rest folgt automatisch
        beim nächsten <code>bank:match</code>.
      </p>

      {(accounts ?? []).length === 0 && (
        <div className="banner-err">
          Noch keine Kontobewegungen importiert. CLI:{" "}
          <code>pnpm --filter sync bank:import --file=auszug.xml</code>
        </div>
      )}

      <form className="toolbar" method="get">
        <select name="account" defaultValue={account}>
          <option value="">alle Konten</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} ({a.iban.slice(-6)})
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status}>
          <option value="">alle</option>
          <option value="unmatched">offen (inkl. teilweise)</option>
          <option value="partial">nur teilweise</option>
          <option value="matched">zugeordnet</option>
          <option value="ignored">ignoriert</option>
        </select>
        <button type="submit">Anzeigen</button>
        <span className="count">{total.toLocaleString("de-DE")} Umsätze</span>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <InvoiceDatalist id="ar-list" options={arCandidates} />
      <InvoiceDatalist id="er-list" options={erCandidates} />

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Datum</th>
              <th style={{ textAlign: "right" }}>Betrag</th>
              <th>Gegenseite</th>
              <th>Verwendungszweck</th>
              <th>Zuordnung</th>
            </tr>
          </thead>
          <tbody>
            {data.map((tx) => {
              const matches = tx.matches ?? [];
              return (
                <tr key={tx.id}>
                  <td>{fmtDate(tx.booking_date)}</td>
                  <td
                    style={{ textAlign: "right" }}
                    className={tx.amount < 0 ? "msg-err" : ""}
                  >
                    {fmtEur(tx.amount)}
                  </td>
                  <td className="wrap" style={{ maxWidth: 160 }}>
                    {tx.counterparty_name ?? "–"}
                  </td>
                  <td
                    style={{
                      maxWidth: 220,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={tx.purpose ?? undefined}
                  >
                    {tx.purpose ?? "–"}
                  </td>
                  <td>
                    {(() => {
                      const side = tx.amount > 0 ? "debitor" : "kreditor";
                      const allocated =
                        Math.round(
                          matches.reduce((s, m) => s + Math.abs(m.amount ?? 0), 0) * 100,
                        ) / 100;
                      const remaining = Math.round((Math.abs(tx.amount) - allocated) * 100) / 100;
                      const prefill =
                        (side === "debitor" ? arPrefill : erPrefill).get(cents(remaining)) ??
                        undefined;
                      return (
                        <div className="rows" style={{ gap: 4 }}>
                          {matches.map((m) => {
                            const inc = m.incoming_document;
                            const href = inc
                              ? `/eingangsrechnungen/${inc.id}`
                              : `/rechnungen/${m.sales_invoice?.id}`;
                            const label = inc
                              ? (inc.doc_number ?? "?")
                              : (m.sales_invoice?.invoice_number ?? "?");
                            return (
                              <div key={m.id} className="row" style={{ padding: "4px 8px" }}>
                                <Link href={href}>{label}</Link>
                                <span className="count">{fmtEur(m.amount)}</span>
                                {m.auto && <span className="tag">auto</span>}
                                <form action={unmatchTransaction}>
                                  <input type="hidden" name="match_id" value={m.id} />
                                  <input type="hidden" name="tx_id" value={tx.id} />
                                  <button className="ghost" style={{ padding: "2px 8px" }}>
                                    aufheben
                                  </button>
                                </form>
                              </div>
                            );
                          })}
                          {remaining > 0.01 && (
                            <>
                              {matches.length > 0 && (
                                <span className="count">
                                  offen: {fmtEur(remaining)} — weitere Rechnung zuordnen
                                </span>
                              )}
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
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>Keine Umsätze.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="pager">
          {page > 1 ? <Link className="ghost" href={href(page - 1)}>← zurück</Link> : <span className="nav-disabled">← zurück</span>}
          <span className="count">Seite {page} / {lastPage}</span>
          {page < lastPage ? <Link className="ghost" href={href(page + 1)}>weiter →</Link> : <span className="nav-disabled">weiter →</span>}
        </div>
      )}
    </>
  );
}
