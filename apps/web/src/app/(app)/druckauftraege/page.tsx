import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
type Search = { q?: string; state?: string; page?: string };

export default async function DruckauftraegePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const state = sp.state ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("portal_order")
    .select(
      "id, external_reference, portal_state, description, quantity, deliver_date, received_at, ship_to, " +
        "portal:portal_id(code, name), items:portal_order_item(count), files:portal_order_file(count)",
      { count: "exact" },
    );
  if (state) query = query.eq("portal_state", state);
  if (q) {
    const like = `%${q.replace(/[%,]/g, "")}%`;
    query = query.or(`external_reference.ilike.${like},description.ilike.${like}`);
  }

  const res = await query
    .order("received_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const error = res.error;
  const count = res.count;
  const data = (res.data ?? []) as unknown as {
    id: string;
    external_reference: string | null;
    portal_state: string | null;
    description: string | null;
    quantity: number | null;
    deliver_date: string | null;
    received_at: string;
    ship_to: { city?: string; country?: string } | null;
    portal: { code?: string } | null;
    items: { count: number }[];
    files: { count: number }[];
  }[];

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (state) u.set("state", state);
    if (p > 1) u.set("page", String(p));
    const str = u.toString();
    return str ? `/druckauftraege?${str}` : "/druckauftraege";
  };

  return (
    <>
      <h1>Druckaufträge</h1>
      <p className="lead">
        Eingehende Aufträge aus Kundenportalen. Abruf:{" "}
        <code>pnpm --filter sync portal:pull --portal=onlineprinters</code>. Parallelbetrieb
        zu n8n — werk liest nur mit.
      </p>

      <form className="toolbar" method="get">
        <input name="q" defaultValue={q} placeholder="Referenz / Beschreibung" />
        <input name="state" defaultValue={state} placeholder="Status (NEW …)" style={{ width: 120 }} />
        <button type="submit">Filtern</button>
        <span className="count">{total.toLocaleString("de-DE")} Aufträge</span>
      </form>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Referenz</th>
              <th>Status</th>
              <th>Produkt</th>
              <th style={{ textAlign: "right" }}>Menge</th>
              <th>Liefertermin</th>
              <th>Ziel</th>
              <th>Pos / Dateien</th>
              <th>Eingang</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const portal = r.portal;
              const ship = r.ship_to;
              const items = r.items?.[0]?.count ?? 0;
              const files = r.files?.[0]?.count ?? 0;
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/druckauftraege/${r.id}`}>{r.external_reference}</Link>
                    {portal?.code ? <span className="count" style={{ marginLeft: 6 }}>{portal.code}</span> : null}
                  </td>
                  <td>{r.portal_state ?? "—"}</td>
                  <td className="wrap" style={{ maxWidth: 320 }}>{r.description ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.quantity != null ? Number(r.quantity) : "—"}</td>
                  <td>{r.deliver_date ? fmtDate(r.deliver_date) : "—"}</td>
                  <td className="count">
                    {ship ? `${ship.country ?? ""} ${ship.city ?? ""}`.trim() : "—"}
                  </td>
                  <td className="count">{items} / {files}</td>
                  <td className="count">{fmtDate(r.received_at)}</td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)" }}>Keine Druckaufträge.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="pager">
          {page > 1 && <Link href={href(page - 1)}>← zurück</Link>}
          <span className="count">Seite {page} / {lastPage}</span>
          {page < lastPage && <Link href={href(page + 1)}>weiter →</Link>}
        </div>
      )}
    </>
  );
}
