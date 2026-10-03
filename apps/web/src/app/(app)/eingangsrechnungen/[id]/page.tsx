import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { ReviewForm } from "./ui";
import { setIncomingStatus, bestaetigeUst } from "../actions";

export const dynamic = "force-dynamic";

type AllocRow = {
  id: string;
  link_type: string;
  sales_order_id: string | null;
  material_ref: string | null;
  cost_center_id: string | null;
  amount: number | null;
  note: string | null;
  order_ref: string | null;
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
  supplier_sku: string | null;
  order_reference: string | null;
  linked_document_id: string | null;
  incoming_document_allocation: AllocRow[];
};

// Keyline-Schreibweise: "W7MN2S" -> "W7-MN-2S".
const fmtOrderNo = (n: string) => (/^[A-Z0-9]{6}$/.test(n) ? n.match(/../g)!.join("-") : n);

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
    { data: organizations },
  ] = await Promise.all([
    supabase.from("incoming_document").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("incoming_document_item")
      .select(
        "id, position, description, quantity, unit_price, tax_rate, net_amount, ledger_account, tax_code_id, material_ref, supplier_sku, order_reference, linked_document_id, " +
          "incoming_document_allocation ( id, link_type, sales_order_id, order_ref, material_ref, cost_center_id, amount, note, sales_order:sales_order_id ( order_number ) )",
      )
      .eq("incoming_document_id", id)
      .order("position", { nullsFirst: false }),
    supabase.from("tax_code").select("id, code, name").eq("direction", "input").order("code"),
    supabase.from("cost_center").select("id, number, name").eq("is_active", true).order("number"),
    supabase.from("ledger_account").select("number, name").eq("is_active", true).order("number"),
    supabase.from("organization").select("id, name").order("name"),
  ]);

  // Andere Belege zum Verknüpfen von Belegzeilen (z.B. SaaS-Anbieter-Rechnung,
  // die zusätzlich auf einer Kreditkartenabrechnung auftaucht) - Bridge statt
  // Doppelerfassung, siehe PositionModal "Verknüpfter Beleg".
  const { data: otherDocsRaw } = await supabase
    .from("incoming_document")
    .select("id, doc_number, file_name, supplier_name, gross_amount, doc_date")
    .neq("id", id)
    .not("status", "in", "(advice,dunning)")
    .order("doc_date", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!doc) notFound();

  // Verknüpfte Bankzeile (falls schon zugeordnet) - für den Hinweis im
  // Zahlung-Block, direkt mit Link zur Bank-Übersicht dieses Kontos.
  const { data: bankMatch } = await supabase
    .from("bank_transaction_match")
    .select(
      "amount, bank_transaction:bank_transaction_id(id, booking_date, amount, counterparty_name, bank_account_id)",
    )
    .eq("incoming_document_id", id)
    .limit(1)
    .maybeSingle();
  const linkedBankTx = (
    bankMatch?.bank_transaction as unknown as
      | { id: string; booking_date: string; amount: number; counterparty_name: string | null; bank_account_id: string }
      | { id: string; booking_date: string; amount: number; counterparty_name: string | null; bank_account_id: string }[]
      | null
  ) ?? null;
  const bankTxInfo = Array.isArray(linkedBankTx) ? (linkedBankTx[0] ?? null) : linkedBankTx;

  // Gelernte/von Hand gesetzte Vorkontierung für den Lieferanten (siehe
  // /einstellungen/vorkontierung) - nur ein Vorschlag fürs Formular, greift
  // dort nur wenn das Dokument noch kein eigenes Aufwandskonto hat.
  const { data: postingRule } = doc.supplier_organization_id
    ? await supabase
        .from("posting_rule")
        .select("expense_account, tax_code_id, payment_method, is_active")
        .eq("organization_id", doc.supplier_organization_id)
        .maybeSingle()
    : { data: null };
  const suggestion = postingRule?.is_active
    ? {
        ledger_account: postingRule.expense_account,
        tax_code_id: postingRule.tax_code_id,
        payment_method: postingRule.payment_method,
      }
    : null;

  const pdfUrl = doc.pdf_storage_key ? await signedGetUrl(doc.pdf_storage_key, 1800) : null;
  const isAdvice = doc.doc_type === "payment_advice" || doc.status === "advice";
  const isDunning = doc.doc_type === "dunning" || doc.status === "dunning";
  const isHint = isAdvice || isDunning;
  const dun = ((doc.extraction as { dunning?: Record<string, unknown> } | null)?.dunning ??
    {}) as Record<string, unknown>;

  const ust = ((doc.extraction as { _ust?: { status?: string; tax_code_id?: string | null; tax_code?: string | null; reason?: string } } | null)
    ?._ust ?? null);
  const ustOpen = !isHint && ust?.status === "vorschlag" && ["captured", "extracted", "reviewed"].includes(doc.status);

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
    supplier_sku: it.supplier_sku ?? "",
    order_reference: it.order_reference ?? "",
    linked_document_id: it.linked_document_id ?? "",
    allocations: (it.incoming_document_allocation ?? []).map((a) => ({
      id: a.id,
      link_type: (a.link_type as "sales_order" | "material" | "cost_center") ?? "sales_order",
      order_number: a.sales_order?.order_number
        ? fmtOrderNo(a.sales_order.order_number)
        : (a.order_ref ?? ""),
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
        {!isHint && !ustOpen && ["extracted", "reviewed"].includes(doc.status) && (
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

      {ustOpen && (
        <div className="bd-card" style={{ borderLeft: "4px solid #d98e04", margin: "0 0 14px", padding: "12px 16px" }}>
          <strong>USt bitte bestätigen</strong>
          <p className="bd-hint" style={{ margin: "4px 0 8px" }}>
            Die KI ist sich bei der Umsatzsteuer nicht ganz sicher und hat deshalb <em>keinen</em> Steuerschlüssel gesetzt.
            Grund: {ust?.reason ?? "–"}
          </p>
          <form action={bestaetigeUst} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input type="hidden" name="id" value={doc.id} />
            <div className="bd-field" style={{ width: 320 }}>
              <label className="bd-field-label" htmlFor="ust_code">
                {ust?.tax_code_id ? `Vorschlag: ${ust.tax_code}` : "Steuerschlüssel wählen"}
              </label>
              <select className="bd-field-input" id="ust_code" name="tax_code_id" defaultValue={ust?.tax_code_id ?? ""} required>
                <option value="" disabled>– wählen –</option>
                {(taxCodes ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.code} – {t.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="bd-btn bd-btn-primary">Bestätigen</button>
          </form>
        </div>
      )}
      {!isHint && ust?.status === "sicher" && (
        <p className="bd-hint">USt automatisch erkannt (sicher): {ust.reason}.</p>
      )}

      {doc.notes && <div className="banner-err">{doc.notes}</div>}

      {!isHint && (
        <div className="content-wide">
          <ReviewForm
            doc={doc as Record<string, unknown>}
            items={items}
            taxCodes={(taxCodes ?? []).map((t) => ({ id: t.id, label: `${t.code} – ${t.name}` }))}
            costCenters={(costCenters ?? []).map((c) => ({ id: c.id, label: `${c.number} – ${c.name}` }))}
            ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({
              value: a.number,
              label: `${a.number} – ${a.name}`,
            }))}
            organizations={(organizations ?? []).map((o) => ({ value: o.id, label: o.name }))}
            documents={(otherDocsRaw ?? []).map((d) => ({
              value: d.id,
              label: `${d.doc_number ?? d.file_name ?? d.id.slice(0, 8)} · ${d.supplier_name ?? "–"} · ${
                d.gross_amount != null ? `${Number(d.gross_amount).toFixed(2)} €` : "–"
              }${d.doc_date ? ` · ${d.doc_date}` : ""}`,
            }))}
            suggestion={suggestion}
            bankTx={bankTxInfo}
            pdfUrl={pdfUrl}
            pdfLabel={doc.doc_number ?? doc.file_name ?? "Beleg.pdf"}
          />
        </div>
      )}
    </>
  );
}
