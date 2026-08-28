import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const RELATION_LABEL: Record<string, string> = {
  customer: "Kunde",
  supplier: "Lieferant",
  both: "Kunde + Lieferant",
};
const SEGMENT_LABEL: Record<string, string> = {
  akzidenz: "Akzidenz",
  kalender: "Kalender",
  mixed: "gemischt",
};

type Search = { q?: string; page?: string; relation?: string };

export default async function OrganisationenPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const relation = sp.relation ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("organization")
    .select(
      "id, name, relation, customer_segment, customer_number, supplier_number, vat_id, tax_country",
      { count: "exact" },
    );

  if (q) {
    const like = `%${q.replace(/[%,]/g, "")}%`;
    query = query.or(
      `name.ilike.${like},customer_number.ilike.${like},supplier_number.ilike.${like},vat_id.ilike.${like}`,
    );
  }
  if (relation === "customer") query = query.in("relation", ["customer", "both"]);
  if (relation === "supplier") query = query.in("relation", ["supplier", "both"]);

  const { data, count, error } = await query
    .order("name")
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (relation) u.set("relation", relation);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/organisationen?${s}` : "/organisationen";
  };

  return (
    <>
      <h1>Organisationen</h1>
      <p className="lead">Kunden und Lieferanten. Quelle Akzidenz: Keyline (Spiegel).</p>

      <form className="toolbar" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Name, Debitor/Kreditor-Nr, USt-IdNr…"
          style={{ minWidth: 280 }}
        />
        <select name="relation" defaultValue={relation}>
          <option value="">alle</option>
          <option value="customer">nur Kunden</option>
          <option value="supplier">nur Lieferanten</option>
        </select>
        <button type="submit">Suchen</button>
        {(q || relation) && <Link href="/organisationen">zurücksetzen</Link>}
        <span className="count">{total.toLocaleString("de-DE")} Treffer</span>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Segment</th>
              <th>Debitor</th>
              <th>Kreditor</th>
              <th>USt-IdNr</th>
              <th>Land</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((o) => (
              <tr key={o.id}>
                <td className="wrap">
                  <Link href={`/organisationen/${o.id}`}>{o.name}</Link>
                </td>
                <td>{RELATION_LABEL[o.relation] ?? o.relation}</td>
                <td>{o.customer_segment ? SEGMENT_LABEL[o.customer_segment] ?? o.customer_segment : "–"}</td>
                <td>{o.customer_number ?? "–"}</td>
                <td>{o.supplier_number ?? "–"}</td>
                <td>{o.vat_id ?? "–"}</td>
                <td>{o.tax_country}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>
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
            <Link className="ghost" href={pageHref(page - 1)}>
              ← zurück
            </Link>
          ) : (
            <span className="nav-disabled">← zurück</span>
          )}
          <span className="count">
            Seite {page} / {lastPage}
          </span>
          {page < lastPage ? (
            <Link className="ghost" href={pageHref(page + 1)}>
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
