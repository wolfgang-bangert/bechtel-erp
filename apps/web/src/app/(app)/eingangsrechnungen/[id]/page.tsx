import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { fmtEur, fmtNumber } from "@/lib/format";
import { ReviewForm } from "./ui";
import { setIncomingStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function IncomingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: doc, error }, { data: items }, { data: taxCodes }, { data: costCenters }] =
    await Promise.all([
      supabase.from("incoming_document").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("incoming_document_item")
        .select("position, description, quantity, unit_price, tax_rate, net_amount")
        .eq("incoming_document_id", id)
        .order("position", { nullsFirst: false }),
      supabase.from("tax_code").select("id, code, name").eq("direction", "input").order("code"),
      supabase.from("cost_center").select("id, number, name").eq("is_active", true).order("number"),
    ]);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!doc) notFound();

  const pdfUrl = doc.pdf_storage_key ? await signedGetUrl(doc.pdf_storage_key, 1800) : null;
  const isAdvice = doc.doc_type === "payment_advice" || doc.status === "advice";

  return (
    <>
      <p className="lead">
        <Link href="/eingangsrechnungen">← Eingangsrechnungen</Link>
      </p>
      <h1>{doc.doc_number ?? doc.file_name ?? "Beleg"}</h1>
      <p className="lead">
        {isAdvice ? "Zahlungsavis" : `Status ${doc.status}`}
        {!isAdvice &&
          doc.extraction_confidence != null &&
          ` · KI-Konfidenz ${Math.round(doc.extraction_confidence * 100)} %`}
        {doc.email_from && ` · von ${doc.email_from}`}
      </p>

      {isAdvice && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="lead" style={{ marginTop: 0 }}>
            Lastschrift-/Zahlungsavis — keine zu buchende Rechnung. Dient dem
            Kontoauszug-Abgleich.
          </p>
          <table className="data">
            <tbody>
              <tr>
                <th style={{ textAlign: "left" }}>Lieferant</th>
                <td>{doc.supplier_name ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>bezieht sich auf Rechnung(en)</th>
                <td>{(doc.advice_reference ?? []).join(", ") || "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Belastung am</th>
                <td>{doc.advice_debit_date ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Lastschriftbetrag</th>
                <td>{doc.gross_amount != null ? `${doc.gross_amount} ${doc.currency}` : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="toolbar">
        {pdfUrl ? (
          <a className="ghost" href={pdfUrl} target="_blank" rel="noreferrer"
             style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
            PDF öffnen
          </a>
        ) : (
          <span className="count">kein PDF</span>
        )}
        {!isAdvice && ["extracted", "reviewed"].includes(doc.status) && (
          <form action={setIncomingStatus}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="status" value="reviewed" />
            <button type="submit">als geprüft markieren</button>
          </form>
        )}
        {!isAdvice && doc.status === "reviewed" && (
          <form action={setIncomingStatus}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="status" value="booked" />
            <button type="submit">gebucht</button>
          </form>
        )}
        <form action={setIncomingStatus}>
          <input type="hidden" name="id" value={doc.id} />
          <input type="hidden" name="status" value="rejected" />
          <button type="submit" className="ghost">verwerfen</button>
        </form>
      </div>

      {doc.notes && <div className="banner-err">{doc.notes}</div>}

      <div style={{ display: "grid", gridTemplateColumns: pdfUrl ? "1fr 1fr" : "1fr", gap: 24 }}>
        {!isAdvice && (
        <div>
          <ReviewForm
            doc={doc as Record<string, unknown>}
            taxCodes={(taxCodes ?? []).map((t) => ({ id: t.id, label: `${t.code} – ${t.name}` }))}
            costCenters={(costCenters ?? []).map((c) => ({ id: c.id, label: `${c.number} – ${c.name}` }))}
          />

          <h2>Positionen (KI-Vorschlag)</h2>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Beschreibung</th>
                  <th style={{ textAlign: "right" }}>Menge</th>
                  <th style={{ textAlign: "right" }}>Einzel</th>
                  <th style={{ textAlign: "right" }}>USt %</th>
                  <th style={{ textAlign: "right" }}>Netto</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it, i) => (
                  <tr key={i}>
                    <td>{it.position ?? i + 1}</td>
                    <td className="wrap">{it.description ?? "–"}</td>
                    <td style={{ textAlign: "right" }}>{fmtNumber(it.quantity, 2)}</td>
                    <td style={{ textAlign: "right" }}>{fmtEur(it.unit_price)}</td>
                    <td style={{ textAlign: "right" }}>{it.tax_rate ?? "–"}</td>
                    <td style={{ textAlign: "right" }}>{fmtEur(it.net_amount)}</td>
                  </tr>
                ))}
                {(items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--muted)" }}>keine Positionen erkannt</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {pdfUrl && (
          <div>
            <iframe
              src={pdfUrl}
              style={{ width: "100%", height: "80vh", border: "1px solid var(--border)", borderRadius: 6 }}
              title="Beleg-PDF"
            />
          </div>
        )}
      </div>
    </>
  );
}
