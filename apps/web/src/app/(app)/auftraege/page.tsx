import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = { q?: string; source?: string; state?: string; page?: string };

export default async function AuftraegePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const source = sp.source ?? "";
  const state = sp.state ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("sales_order")
    .select(
      "id, order_number, state, order_date, net_total, source, organization:organization(id, name)",
      { count: "exact" },
    );

  if (q) {
    const like = `%${q.replace(/[%,]/g, "")}%`;
    query = query.or(`order_number.ilike.${like}`);
  }
  if (source) query = query.eq("source", source);
  if (state) query = query.eq("state", state);

  const { data, count, error } = await query
    .order("order_date", { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (source) u.set("source", source);
    if (state) u.set("state", state);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/auftraege?${s}` : "/auftraege";
  };

  return (
    <>
      <h1>Aufträge</h1>
      <p className="lead">Spiegel aus Keyline und Ninox.</p>

      <form className="toolbar" method="get">
        <input name="q" defaultValue={q} placeholder="Auftragsnummer…" style={{ minWidth: 220 }} />
        <select name="source" defaultValue={source}>
          <option value="">alle Quellen</option>
          <option value="keyline">Keyline</option>
          <option value="ninox">Ninox</option>
        </select>
        <button type="submit">Suchen</button>
        {(q || source || state) && <Link href="/auftraege">zurücksetzen</Link>}
        <span className="count">{total.toLocaleString("de-DE")} Aufträge</span>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Organisation</th>
              <th>Datum</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Netto</th>
              <th>Quelle</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((o) => {
              const org = o.organization as unknown as { id: string; name: string } | null;
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/auftraege/${o.id}`}>{o.order_number ?? o.id.slice(0, 8)}</Link>
                  </td>
                  <td className="wrap">
                    {org ? <Link href={`/organisationen/${org.id}`}>{org.name}</Link> : "–"}
                  </td>
                  <td>{fmtDate(o.order_date)}</td>
                  <td>{o.state ?? "–"}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(o.net_total)}</td>
                  <td>{o.source}</td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Keine Treffer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="pager">
          {page > 1 ? (
            <Link className="ghost" href={href(page - 1)}>
              ← zurück
            </Link>
          ) : (
            <span className="nav-disabled">← zurück</span>
          )}
          <span className="count">
            Seite {page} / {lastPage}
          </span>
          {page < lastPage ? (
            <Link className="ghost" href={href(page + 1)}>
              weiter →
            </Link>
          ) : (
            <span className="nav-disabled">weiter →</span>
          )}
        </div>
      )}
    </>
  );
}
