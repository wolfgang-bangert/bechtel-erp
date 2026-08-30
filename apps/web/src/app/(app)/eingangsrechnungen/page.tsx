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
  advice: "Zahlungsavis",
};

export default async function EingangsrechnungenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";
  const isAdvice = status === "advice";

  const supabase = await createClient();
  let q = supabase
    .from("incoming_document")
    .select(
      "id, file_name, doc_number, doc_date, gross_amount, status, extraction_confidence, supplier_name, email_from, advice_reference, advice_debit_date",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  // Ohne Filter: Zahlungsavis raus aus der Rechnungs-Prüfliste.
  else q = q.neq("status", "advice");
  const { data, count, error } = await q;

  const { count: adviceCount } = await supabase
    .from("incoming_document")
    .select("id", { count: "exact", head: true })
    .eq("status", "advice");

  return (
    <>
      <h1>Eingangsrechnungen</h1>
      <p className="lead">
        Aus dem Postfach <code>rechnungen@bechtel-druck.de</code>, per KI
        vorerfasst. Prüfen → kontieren → für DATEV freigeben.
      </p>

      <form className="toolbar" method="get">
        <select name="status" defaultValue={status}>
          <option value="">offene Rechnungen</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit">Filtern</button>
        <span className="count">{count ?? 0} Belege</span>
        {!isAdvice && (adviceCount ?? 0) > 0 && (
          <Link className="count" href="/eingangsrechnungen?status=advice">
            · {adviceCount} Zahlungsavis ansehen
          </Link>
        )}
      </form>

      {isAdvice && (
        <p className="lead">
          Zahlungs-/Lastschriftavis — <strong>keine</strong> zu buchenden
          Rechnungen. Sie nennen die Rechnungsnummer(n) und das Belastungsdatum
          und helfen beim Kontoauszug-Abgleich.
        </p>
      )}

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Beleg</th>
              <th>Lieferant</th>
              <th>{isAdvice ? "Belastung am" : "Datum"}</th>
              <th style={{ textAlign: "right" }}>{isAdvice ? "Lastschrift" : "Brutto"}</th>
              <th>{isAdvice ? "bezieht sich auf" : "Status"}</th>
              <th>{isAdvice ? "" : "Konf."}</th>
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
                <td>{fmtDate(isAdvice ? d.advice_debit_date : d.doc_date)}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(d.gross_amount)}</td>
                <td className="wrap">
                  {isAdvice
                    ? (d.advice_reference ?? []).join(", ") || "–"
                    : (STATUS[d.status] ?? d.status)}
                </td>
                <td>
                  {isAdvice
                    ? ""
                    : d.extraction_confidence != null
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
