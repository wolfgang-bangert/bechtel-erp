import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { MatchForm, type Candidate } from "./ui";
import { unmatchTransaction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
type Search = { account?: string; status?: string; page?: string };

const STATUS_LABEL: Record<string, string> = {
  unmatched: "offen",
  matched: "zugeordnet",
  partial: "teilweise",
  ignored: "ignoriert",
};

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
    }[];
  };

  let query = supabase
    .from("bank_transaction")
    .select(
      "id, booking_date, amount, counterparty_name, purpose, match_status, matches:bank_transaction_match(id, amount, auto, sales_invoice:sales_invoice(id, invoice_number))",
      { count: "exact" },
    );
  if (account) query = query.eq("bank_account_id", account);
  if (status) query = query.eq("match_status", status);

  const res = await query
    .order("booking_date", { ascending: false })
    .range(fromRow, fromRow + PAGE_SIZE - 1);
  const error = res.error;
  const count = res.count;
  const data = (res.data ?? []) as unknown as TxRow[];

  // Kandidaten-Rechnungen für die offenen Gutschriften dieser Seite
  const openCredits = data.filter((t) => t.amount > 0 && (t.matches ?? []).length === 0);
  let openInvoices: {
    invoice_number: string | null;
    open_amount: number | null;
    gross_total: number | null;
    organization: { name: string } | null;
  }[] = [];
  if (openCredits.length > 0) {
    const amounts = openCredits.map((t) => t.amount);
    const lo = Math.min(...amounts) * 0.9;
    const hi = Math.max(...amounts) * 1.03;
    const { data: inv } = await supabase
      .from("sales_invoice")
      .select("invoice_number, open_amount, gross_total, organization:organization(name)")
      .eq("kind", "invoice")
      .in("payment_status", ["open", "partly_paid"])
      .gt("open_amount", 0)
      .gte("open_amount", lo)
      .lte("open_amount", hi)
      .not("invoice_number", "is", null)
      .order("open_amount")
      .limit(3000);
    openInvoices = (inv ?? []) as unknown as typeof openInvoices;
  }
  const candidatesFor = (amount: number): Candidate[] =>
    openInvoices
      .filter((i) => {
        const o = i.open_amount ?? 0;
        return o >= amount * 0.94 && o <= amount * 1.03;
      })
      .sort(
        (a, b) =>
          Math.abs((a.open_amount ?? 0) - amount) - Math.abs((b.open_amount ?? 0) - amount),
      )
      .slice(0, 40)
      .map((i) => ({
        number: i.invoice_number!,
        label: `${i.invoice_number} · ${
          (i.organization as unknown as { name: string } | null)?.name ?? "?"
        } · ${fmtEur(i.open_amount)}`,
      }));

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
        Importierte Kontoumsätze (CAMT.053). Gutschriften lassen sich Rechnungen
        zuordnen — der Rest folgt automatisch beim nächsten Abgleich.
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
          <option value="unmatched">offen</option>
          <option value="matched">zugeordnet</option>
          <option value="partial">teilweise</option>
          <option value="ignored">ignoriert</option>
        </select>
        <button type="submit">Anzeigen</button>
        <span className="count">{total.toLocaleString("de-DE")} Umsätze</span>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

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
                  <td className="wrap">{tx.counterparty_name ?? "–"}</td>
                  <td className="wrap" style={{ maxWidth: 320 }}>
                    {tx.purpose ?? "–"}
                  </td>
                  <td>
                    {matches.length > 0 ? (
                      <div className="rows" style={{ gap: 3 }}>
                        {matches.map((m) => (
                          <div key={m.id} className="row" style={{ padding: "4px 8px" }}>
                            <Link href={`/rechnungen/${m.sales_invoice?.id}`}>
                              {m.sales_invoice?.invoice_number ?? "?"}
                            </Link>
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
                        ))}
                      </div>
                    ) : tx.amount > 0 ? (
                      <MatchForm txId={tx.id} candidates={candidatesFor(tx.amount)} />
                    ) : (
                      <span className="count">{STATUS_LABEL[tx.match_status]}</span>
                    )}
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
