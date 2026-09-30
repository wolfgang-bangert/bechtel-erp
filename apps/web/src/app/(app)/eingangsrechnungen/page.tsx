import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  captured: "erfasst",
  extracted: "extrahiert",
  reviewed: "geprüft",
  booked: "gebucht",
  exported: "exportiert",
  rejected: "verworfen",
  advice: "Zahlungsavis",
  dunning: "Mahnung",
};

// Hinweisbelege: keine zu buchenden Rechnungen, eigener Blick.
const HINT = new Set(["advice", "dunning"]);

export default async function EingangsrechnungenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string; dir?: string; payment_method?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";
  const search = (sp.q ?? "").trim();
  const paymentMethod = sp.payment_method ?? "";
  const isHint = HINT.has(status);
  const isAdvice = status === "advice";
  const isDunning = status === "dunning";
  const sort = sp.sort === "supplier" ? "supplier" : "date";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const ascending = dir === "asc";

  const supabase = await createClient();
  let query = supabase
    .from("incoming_document")
    .select(
      "id, file_name, doc_number, doc_type, doc_date, gross_amount, payment_method, status, extraction_confidence, supplier_name, email_from, advice_reference, advice_debit_date",
      { count: "exact" },
    )
    .limit(200);
  if (status) query = query.eq("status", status);
  // Ohne Filter: Hinweisbelege raus aus der Rechnungs-Prüfliste.
  else query = query.not("status", "in", "(advice,dunning)");
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);
  if (search) {
    const like = `%${search.replace(/[%,]/g, "")}%`;
    query = query.or(`supplier_name.ilike.${like},email_from.ilike.${like}`);
  }
  const dateColumn = isAdvice ? "advice_debit_date" : "doc_date";
  const sortColumn = sort === "supplier" ? "supplier_name" : dateColumn;
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  const { data, count, error } = await query;

  const sortHref = (field: "date" | "supplier") => {
    const u = new URLSearchParams();
    if (status) u.set("status", status);
    if (search) u.set("q", search);
    if (paymentMethod) u.set("payment_method", paymentMethod);
    u.set("sort", field);
    u.set("dir", sort === field && dir === "asc" ? "desc" : "asc");
    return `/eingangsrechnungen?${u.toString()}`;
  };
  const sortIndicator = (field: "date" | "supplier") => (sort === field ? (dir === "asc" ? " ▲" : " ▼") : "");

  const [{ count: adviceCount }, { count: dunningCount }] = await Promise.all([
    supabase.from("incoming_document").select("id", { count: "exact", head: true }).eq("status", "advice"),
    supabase.from("incoming_document").select("id", { count: "exact", head: true }).eq("status", "dunning"),
  ]);

  return (
    <>
      <h1>Eingangsrechnungen</h1>
      <p className="lead">
        Aus dem Postfach <code>rechnungen@bechtel-druck.de</code>, per KI
        vorerfasst. Prüfen → kontieren → für DATEV freigeben.
      </p>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <UploadForm />
      </div>

      <form className="toolbar" method="get">
        <select name="status" defaultValue={status}>
          <option value="">offene Rechnungen</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input name="q" defaultValue={search} placeholder="Lieferant, Absender…" style={{ minWidth: 220 }} />
        <select name="payment_method" defaultValue={paymentMethod}>
          <option value="">alle Zahlarten</option>
          <option value="card">Kreditkarte</option>
          <option value="paypal">PayPal</option>
        </select>
        {sort !== "date" && <input type="hidden" name="sort" value={sort} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
        <button type="submit">Filtern</button>
        {(status || search || paymentMethod) && <Link href="/eingangsrechnungen">zurücksetzen</Link>}
        <span className="count">{count ?? 0} Belege</span>
        {!isAdvice && (adviceCount ?? 0) > 0 && (
          <Link className="count" href="/eingangsrechnungen?status=advice">
            · {adviceCount} Zahlungsavis
          </Link>
        )}
        {!isDunning && (dunningCount ?? 0) > 0 && (
          <Link className="count" href="/eingangsrechnungen?status=dunning">
            · {dunningCount} Mahnungen
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
      {isDunning && (
        <p className="lead">
          Mahnungen / Zahlungserinnerungen — <strong>keine</strong> zu buchenden
          Rechnungen. Werden zusätzlich per E-Mail weitergeleitet.
        </p>
      )}

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Beleg</th>
              <th>
                <Link href={sortHref("supplier")}>Lieferant{sortIndicator("supplier")}</Link>
              </th>
              <th>
                <Link href={sortHref("date")}>
                  {isAdvice ? "Belastung am" : "Datum"}
                  {sortIndicator("date")}
                </Link>
              </th>
              <th style={{ textAlign: "right" }}>
                {isAdvice ? "Lastschrift" : isDunning ? "offen" : "Brutto"}
              </th>
              <th>{isHint ? "bezieht sich auf" : "Status"}</th>
              <th>{isHint ? "" : "Konf."}</th>
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
                <td className="wrap">
                  {d.supplier_name ?? d.email_from ?? "–"}
                  {d.payment_method && (
                    <span className="count" title={d.payment_method === "card" ? "Kreditkarte" : "PayPal"}>
                      {" "}
                      {d.payment_method === "card" ? "💳" : "🅿️"}
                    </span>
                  )}
                </td>
                <td>{fmtDate(isAdvice ? d.advice_debit_date : d.doc_date)}</td>
                <td style={{ textAlign: "right" }} className={d.doc_type === "credit_note" ? "msg-ok" : undefined}>
                  {fmtEur(d.doc_type === "credit_note" ? -Math.abs(d.gross_amount ?? 0) : d.gross_amount)}
                </td>
                <td className="wrap">
                  {isHint
                    ? (d.advice_reference ?? []).join(", ") || "–"
                    : (STATUS[d.status] ?? d.status)}
                </td>
                <td>
                  {isHint
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
