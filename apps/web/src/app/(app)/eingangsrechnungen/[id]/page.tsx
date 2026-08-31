import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { ReviewForm } from "./ui";
import { setIncomingStatus } from "../actions";

export const dynamic = "force-dynamic";

type AllocRow = {
  id: string;
  link_type: string;
  sales_order_id: string | null;
  material_ref: string | null;
  cost_center_id: string | null;
  amount: number | null;
  note: string | null;
  sales_order: { order_number: string | null } | null;
};

type ItemRow = {
  id: string;
  position: number | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  net_amount: number | null;
  ledger_account: string | null;
  tax_code_id: string | null;
  material_ref: string | null;
  incoming_document_allocation: AllocRow[];
};

export default async function IncomingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: doc, error },
    { data: itemsRaw },
    { data: taxCodes },
    { data: costCenters },
    { data: ledgerAccounts },
  ] = await Promise.all([
    supabase.from("incoming_document").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("incoming_document_item")
      .select(
        "id, position, description, quantity, unit_price, tax_rate, net_amount, ledger_account, tax_code_id, material_ref, " +
          "incoming_document_allocation ( id, link_type, sales_order_id, material_ref, cost_center_id, amount, note, sales_order:sales_order_id ( order_number ) )",
      )
      .eq("incoming_document_id", id)
      .order("position", { nullsFirst: false }),
    supabase.from("tax_code").select("id, code, name").eq("direction", "input").order("code"),
    supabase.from("cost_center").select("id, number, name").eq("is_active", true).order("number"),
    supabase.from("ledger_account").select("number, name").eq("is_active", true).order("number"),
  ]);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!doc) notFound();

  const pdfUrl = doc.pdf_storage_key ? await signedGetUrl(doc.pdf_storage_key, 1800) : null;
  const isAdvice = doc.doc_type === "payment_advice" || doc.status === "advice";
  const isDunning = doc.doc_type === "dunning" || doc.status === "dunning";
  const isHint = isAdvice || isDunning;
  const dun = ((doc.extraction as { dunning?: Record<string, unknown> } | null)?.dunning ??
    {}) as Record<string, unknown>;

  const items = ((itemsRaw ?? []) as unknown as ItemRow[]).map((it) => ({
    id: it.id,
    position: it.position,
    description: it.description ?? "",
    quantity: it.quantity,
    unit_price: it.unit_price,
    tax_rate: it.tax_rate,
    net_amount: it.net_amount,
    ledger_account: it.ledger_account ?? "",
    tax_code_id: it.tax_code_id ?? "",
    material_ref: it.material_ref ?? "",
    allocations: (it.incoming_document_allocation ?? []).map((a) => ({
      id: a.id,
      link_type: (a.link_type as "sales_order" | "material" | "cost_center") ?? "sales_order",
      order_number: a.sales_order?.order_number ?? "",
      material_ref: a.material_ref ?? "",
      cost_center_id: a.cost_center_id ?? "",
      amount: a.amount,
      note: a.note ?? "",
    })),
  }));

  return (
    <>
      <p className="lead">
        <Link href="/eingangsrechnungen">← Eingangsrechnungen</Link>
      </p>
      <h1>{doc.doc_number ?? doc.file_name ?? "Beleg"}</h1>
      <p className="lead">
        {isAdvice ? "Zahlungsavis" : isDunning ? "Mahnung" : `Status ${doc.status}`}
        {!isHint &&
          doc.extraction_confidence != null &&
          ` · KI-Konfidenz ${Math.round(doc.extraction_confidence * 100)} %`}
        {doc.email_from && ` · von ${doc.email_from}`}
        {isDunning && doc.forwarded_at && " · weitergeleitet"}
      </p>

      {isDunning && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="lead" style={{ marginTop: 0 }}>
            Mahnung / Zahlungserinnerung — keine zu buchende Rechnung.
            {doc.forwarded_at
              ? " Wurde per E-Mail weitergeleitet."
              : " Weiterleitung ausstehend (SMTP/Ziel prüfen)."}
          </p>
          <table className="data">
            <tbody>
              <tr>
                <th style={{ textAlign: "left" }}>Lieferant</th>
                <td>{doc.supplier_name ?? "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>angemahnte Rechnung(en)</th>
                <td>{(doc.advice_reference ?? []).join(", ") || "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>Mahnstufe</th>
                <td>{dun.level != null ? String(dun.level) : "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>offener Betrag</th>
                <td>{doc.gross_amount != null ? `${doc.gross_amount} ${doc.currency}` : "–"}</td>
              </tr>
              <tr>
                <th style={{ textAlign: "left" }}>neue Frist</th>
                <td>{dun.deadline != null ? String(dun.deadline) : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

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
        {!isHint && ["extracted", "reviewed"].includes(doc.status) && (
          <form action={setIncomingStatus}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="status" value="reviewed" />
            <button type="submit">als geprüft markieren</button>
          </form>
        )}
        {!isHint && doc.status === "reviewed" && (
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

      <div style={{ display: "grid", gridTemplateColumns: pdfUrl ? "1.1fr 0.9fr" : "1fr", gap: 24 }}>
        {!isHint && (
          <div>
            <ReviewForm
              doc={doc as Record<string, unknown>}
              items={items}
              taxCodes={(taxCodes ?? []).map((t) => ({ id: t.id, label: `${t.code} – ${t.name}` }))}
              costCenters={(costCenters ?? []).map((c) => ({ id: c.id, label: `${c.number} – ${c.name}` }))}
              ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({
                value: a.number,
                label: `${a.number} – ${a.name}`,
              }))}
            />
          </div>
        )}

        {pdfUrl && (
          <div>
            <iframe
              src={pdfUrl}
              style={{ width: "100%", height: "85vh", border: "1px solid var(--border)", borderRadius: 6, position: "sticky", top: 12 }}
              title="Beleg-PDF"
            />
          </div>
        )}
      </div>
    </>
  );
}
