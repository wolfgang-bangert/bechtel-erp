import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = {
  q?: string;
  source?: string;
  kind?: string;
  year?: string;
  page?: string;
};

export default async function RechnungenPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const source = sp.source ?? "";
  const kind = sp.kind ?? "";
  const year = sp.year ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("sales_invoice")
    .select(
      "id, invoice_number, invoice_date, kind, net_total, tax_total, gross_total, paid_at, source, organization:organization(id, name)",
      { count: "exact" },
    );

  if (q) {
    const like = `%${q.replace(/[%,]/g, "")}%`;
    query = query.ilike("invoice_number", like);
  }
  if (source) query = query.eq("source", source);
  if (kind) query = query.eq("kind", kind);
  if (/^\d{4}$/.test(year)) {
    query = query
      .gte("invoice_date", `${year}-01-01`)
      .lt("invoice_date", `${Number(year) + 1}-01-01`);
  }

  const { data, count, error } = await query
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageGross = (data ?? []).reduce((s, r) => s + (r.gross_total ?? 0), 0);

  const href = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, source, kind, year })) if (v) u.set(k, v);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/rechnungen?${s}` : "/rechnungen";
  };

  const years = Array.from({ length: 9 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <>
      <h1>Rechnungen</h1>
      <p className="lead">Spiegel aus Keyline und Ninox.</p>

      <form className="toolbar" method="get">
        <input name="q" defaultValue={q} placeholder="Rechnungsnummer…" style={{ minWidth: 180 }} />
        <select name="source" defaultValue={source}>
          <option value="">alle Quellen</option>
          <option value="keyline">Keyline</option>
          <option value="ninox">Ninox</option>
        </select>
        <select name="kind" defaultValue={kind}>
          <option value="">Rg + Gutschrift</option>
          <option value="invoice">nur Rechnungen</option>
          <option value="credit_note">nur Gutschriften</option>
        </select>
        <select name="year" defaultValue={year}>
          <option value="">alle Jahre</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="submit">Filtern</button>
        {(q || source || kind || year) && <Link href="/rechnungen">zurücksetzen</Link>}
        <span className="count">
          {total.toLocaleString("de-DE")} · Seite brutto {fmtEur(pageGross)}
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
              <th style={{ textAlign: "right" }}>Netto</th>
              <th style={{ textAlign: "right" }}>USt</th>
              <th style={{ textAlign: "right" }}>Brutto</th>
              <th>Bezahlt</th>
              <th>Quelle</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((inv) => {
              const org = inv.organization as unknown as { id: string; name: string } | null;
              return (
                <tr key={inv.id}>
                  <td>
                    <Link href={`/rechnungen/${inv.id}`}>
                      {inv.invoice_number ?? inv.id.slice(0, 8)}
                    </Link>
                    {inv.kind === "credit_note" && (
                      <span className="tag" style={{ marginLeft: 6 }}>GS</span>
                    )}
                  </td>
                  <td className="wrap">
                    {org ? <Link href={`/organisationen/${org.id}`}>{org.name}</Link> : "–"}
                  </td>
                  <td>{fmtDate(inv.invoice_date)}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(inv.net_total)}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(inv.tax_total)}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(inv.gross_total)}</td>
                  <td>{inv.paid_at ? fmtDate(inv.paid_at) : "–"}</td>
                  <td>{inv.source}</td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)" }}>
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
