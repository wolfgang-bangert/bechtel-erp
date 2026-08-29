import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
type Search = { year?: string; overdue?: string; page?: string };

export default async function OffenePostenPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : String(new Date().getFullYear());
  const overdue = sp.overdue === "1";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  let query = supabase
    .from("sales_invoice")
    .select(
      "id, invoice_number, invoice_date, due_date, gross_total, paid_total, open_amount, source, organization:organization(id, name)",
      { count: "exact" },
    )
    .eq("kind", "invoice")
    .in("payment_status", ["open", "partly_paid"])
    .gt("open_amount", 0)
    .gte("invoice_date", `${year}-01-01`)
    .lt("invoice_date", `${Number(year) + 1}-01-01`);
  if (overdue) query = query.lt("due_date", today);

  const { data, count, error } = await query
    .order("invoice_date")
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageOpen = (data ?? []).reduce((s, r) => s + (r.open_amount ?? 0), 0);
  const years = Array.from({ length: 8 }, (_, i) => String(new Date().getFullYear() - i));
  const href = (p: number) =>
    `/offene-posten?year=${year}${overdue ? "&overdue=1" : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <h1>Offene Posten</h1>
      <p className="lead">
        Ausgangsrechnungen ohne verbuchte Zahlung. Zahlungen kommen aus dem
        Bankabgleich — bis der regelmäßig läuft, erscheint hier fast alles als offen.
      </p>

      <form className="toolbar" method="get">
        <select name="year" defaultValue={year}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <label className="chk">
          <input type="checkbox" name="overdue" value="1" defaultChecked={overdue} /> nur überfällig
        </label>
        <button type="submit">Anzeigen</button>
        <span className="count">
          {total.toLocaleString("de-DE")} Posten · Seite offen {fmtEur(pageOpen)}
        </span>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Organisation</th>
              <th>Datum</th>
              <th>Fällig</th>
              <th>Tage über</th>
              <th style={{ textAlign: "right" }}>Brutto</th>
              <th style={{ textAlign: "right" }}>offen</th>
              <th>Quelle</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((inv) => {
              const org = inv.organization as unknown as { id: string; name: string } | null;
              const daysOver = inv.due_date
                ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
                : null;
              return (
                <tr key={inv.id}>
                  <td>
                    <Link href={`/rechnungen/${inv.id}`}>
                      {inv.invoice_number ?? inv.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="wrap">
                    {org ? <Link href={`/organisationen/${org.id}`}>{org.name}</Link> : "–"}
                  </td>
                  <td>{fmtDate(inv.invoice_date)}</td>
                  <td>{fmtDate(inv.due_date)}</td>
                  <td className={daysOver != null && daysOver > 0 ? "msg-err" : ""}>
                    {daysOver != null && daysOver > 0 ? daysOver : "–"}
                  </td>
                  <td style={{ textAlign: "right" }}>{fmtEur(inv.gross_total)}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(inv.open_amount)}</td>
                  <td>{inv.source}</td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)" }}>Keine offenen Posten.</td>
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
