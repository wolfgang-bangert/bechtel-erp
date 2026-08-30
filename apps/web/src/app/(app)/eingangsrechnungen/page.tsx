import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  captured: "erfasst",
  extracted: "extrahiert",
  reviewed: "geprüft",
  booked: "gebucht",
  exported: "exportiert",
  rejected: "verworfen",
};

export default async function EingangsrechnungenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";

  const supabase = await createClient();
  let q = supabase
    .from("incoming_document")
    .select(
      "id, file_name, doc_number, doc_date, gross_amount, status, extraction_confidence, supplier_name, email_from",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data, count, error } = await q;

  return (
    <>
      <h1>Eingangsrechnungen</h1>
      <p className="lead">
        Aus dem Postfach <code>rechnungen@bechtel-druck.de</code>, per KI
        vorerfasst. Prüfen → kontieren → für DATEV freigeben.
      </p>

      <form className="toolbar" method="get">
        <select name="status" defaultValue={status}>
          <option value="">alle</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit">Filtern</button>
        <span className="count">{count ?? 0} Belege</span>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Beleg</th>
              <th>Lieferant</th>
              <th>Datum</th>
              <th style={{ textAlign: "right" }}>Brutto</th>
              <th>Status</th>
              <th>Konf.</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id}>
                <td className="wrap">
                  <Link href={`/eingangsrechnungen/${d.id}`}>
                    {d.doc_number ?? d.file_name ?? d.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="wrap">{d.supplier_name ?? d.email_from ?? "–"}</td>
                <td>{fmtDate(d.doc_date)}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(d.gross_amount)}</td>
                <td>{STATUS[d.status] ?? d.status}</td>
                <td>
                  {d.extraction_confidence != null
                    ? `${Math.round(d.extraction_confidence * 100)} %`
                    : "–"}
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Noch keine Belege. CLI:{" "}
                  <code>pnpm --filter sync mail:fetch</code> →{" "}
                  <code>pnpm --filter sync incoming:extract</code>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
