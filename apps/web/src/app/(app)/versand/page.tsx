import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL } from "./status";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = { q?: string; status?: string; page?: string };

export default async function VersandListePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("shipment")
    .select(
      "id, shipment_number, status, ship_date, carrier_service, organization:organization_id(name), carrier:carrier_id(name), recipients:shipment_recipient(name, city, verified)",
      { count: "exact" },
    );

  if (status) query = query.eq("status", status);
  if (q) {
    const like = `%${q.replace(/[%,]/g, "")}%`;
    query = query.or(`shipment_number.ilike.${like},carrier_service.ilike.${like}`);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (p > 1) u.set("page", String(p));
    const str = u.toString();
    return str ? `/versand?${str}` : "/versand";
  };

  return (
    <>
      <h1>Sendungen</h1>
      <p className="lead">
        Versand-Erfassung: Empfänger, Packstücke, Positionen, Lieferschein.
      </p>

      <div className="toolbar">
        <Link className="ghost" href="/versand/neu" style={{ padding: "7px 12px" }}>
          + Neue Sendung
        </Link>
        <Link className="ghost" href="/versand/vergleich" style={{ padding: "7px 12px" }}>
          Frachtpreis-Vergleich
        </Link>
        <form method="get" className="toolbar" style={{ margin: 0 }}>
          <input name="q" defaultValue={q} placeholder="Nummer / Produkt" />
          <select name="status" defaultValue={status}>
            <option value="">alle Status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="submit">Filtern</button>
        </form>
        <span className="count">{total} Sendungen</span>
      </div>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Status</th>
              <th>Empfänger</th>
              <th>Kunde</th>
              <th>Carrier</th>
              <th>Versanddatum</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row) => {
              const rec = Array.isArray(row.recipients) ? row.recipients[0] : row.recipients;
              const org = row.organization as { name?: string } | null;
              const carrier = row.carrier as { name?: string } | null;
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={`/versand/${row.id}`}>{row.shipment_number ?? "—"}</Link>
                  </td>
                  <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                  <td>
                    {rec?.name ?? "—"}
                    {rec?.city ? `, ${rec.city}` : ""}{" "}
                    {rec ? (
                      rec.verified ? (
                        <span className="msg-ok" title="Adresse geprüft">
                          ✓
                        </span>
                      ) : (
                        <span className="tag">ungeprüft</span>
                      )
                    ) : null}
                  </td>
                  <td>{org?.name ?? "—"}</td>
                  <td>
                    {carrier?.name ?? "—"}
                    {row.carrier_service ? ` · ${row.carrier_service}` : ""}
                  </td>
                  <td>{row.ship_date ?? "—"}</td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Keine Sendungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="pager">
          {page > 1 && <Link href={pageHref(page - 1)}>← zurück</Link>}
          <span className="count">
            Seite {page} / {lastPage}
          </span>
          {page < lastPage && <Link href={pageHref(page + 1)}>weiter →</Link>}
        </div>
      )}
    </>
  );
}
