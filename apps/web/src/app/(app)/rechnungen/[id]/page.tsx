import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { fmtDate, fmtEur, fmtNumber } from "@/lib/format";

const PAY_LABEL: Record<string, string> = {
  open: "offen",
  partly_paid: "teilbezahlt",
  paid: "bezahlt",
  overpaid: "überzahlt",
};

export const dynamic = "force-dynamic";

export default async function RechnungDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: inv, error }, { data: items }] = await Promise.all([
    supabase
      .from("sales_invoice")
      .select(
        "*, organization:organization(id, name), sales_order:sales_order(id, order_number)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sales_invoice_item")
      .select("position, description, quantity, unit_price, tax_rate, net_amount")
      .eq("sales_invoice_id", id)
      .order("position", { nullsFirst: false }),
  ]);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!inv) notFound();

  const org = inv.organization as unknown as { id: string; name: string } | null;
  const order = inv.sales_order as unknown as { id: string; order_number: string | null } | null;
  const taxes = (inv.tax_breakdown ?? {}) as Record<string, number>;
  const addr = (inv.billing_address_snapshot ?? {}) as Record<string, unknown>;
  const pdfUrl = inv.pdf_storage_key ? await signedGetUrl(inv.pdf_storage_key) : null;

  return (
    <>
      <p className="lead">
        <Link href="/rechnungen">← Rechnungen</Link>
      </p>
      <h1>
        {inv.kind === "credit_note" ? "Gutschrift" : "Rechnung"}{" "}
        {inv.invoice_number ?? id.slice(0, 8)}
      </h1>
      <p className="lead">
        {inv.source}
        {inv.reversed_invoice_external_id ? " · Storno-Bezug vorhanden" : ""}
        {inv.kind === "invoice" && (
          <>
            {" · "}
            <span className={inv.payment_status === "paid" ? "msg-ok" : ""}>
              {PAY_LABEL[inv.payment_status] ?? inv.payment_status}
            </span>
            {inv.payment_status !== "paid" && inv.open_amount != null && (
              <> · offen {fmtEur(inv.open_amount)}</>
            )}
          </>
        )}
      </p>
      <div className="toolbar">
        {pdfUrl ? (
          <a className="ghost" href={pdfUrl} target="_blank" rel="noreferrer"
             style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
            PDF öffnen
          </a>
        ) : (
          <span className="count">
            {inv.pdf_status === "none"
              ? "kein PDF in der Quelle"
              : inv.pdf_status === "error"
                ? "PDF-Abruf fehlgeschlagen"
                : "PDF noch nicht geholt"}
          </span>
        )}
      </div>

      <dl className="kv">
        <dt>Organisation</dt>
        <dd>{org ? <Link href={`/organisationen/${org.id}`}>{org.name}</Link> : "–"}</dd>
        <dt>Auftrag</dt>
        <dd>
          {order ? (
            <Link href={`/auftraege/${order.id}`}>{order.order_number ?? order.id.slice(0, 8)}</Link>
          ) : (
            "–"
          )}
        </dd>
        <dt>Rechnungsdatum</dt>
        <dd>{fmtDate(inv.invoice_date)}</dd>
        <dt>Leistungsdatum</dt>
        <dd>{fmtDate(inv.service_date)}</dd>
        <dt>Fällig</dt>
        <dd>{fmtDate(inv.due_date)}</dd>
        <dt>Bezahlt am</dt>
        <dd>{fmtDate(inv.paid_at)}</dd>
        <dt>Rechnungsanschrift</dt>
        <dd>
          {[
            addr.addressee ?? addr.name,
            [addr.street ?? addr.line1, addr.number ?? addr.house_number]
              .filter(Boolean)
              .join(" "),
            addr.addition ?? addr.line2,
            [addr.zip_code ?? addr.zip, addr.town ?? addr.city].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join(", ") || "–"}
        </dd>
      </dl>

      <h2>Positionen</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Beschreibung</th>
              <th style={{ textAlign: "right" }}>Menge</th>
              <th style={{ textAlign: "right" }}>Einzelpreis</th>
              <th style={{ textAlign: "right" }}>USt %</th>
              <th style={{ textAlign: "right" }}>Netto</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it, i) => (
              <tr key={i}>
                <td>{it.position ?? i + 1}</td>
                <td className="wrap">{it.description ?? "–"}</td>
                <td style={{ textAlign: "right" }}>{fmtNumber(it.quantity, 0)}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(it.unit_price)}</td>
                <td style={{ textAlign: "right" }}>{it.tax_rate != null ? `${it.tax_rate}` : "–"}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(it.net_amount)}</td>
              </tr>
            ))}
            {(items ?? []).length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Keine Positionen gespiegelt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Summen</h2>
      <dl className="kv">
        <dt>Netto</dt>
        <dd>{fmtEur(inv.net_total)}</dd>
        {Object.entries(taxes).map(([rate, amount]) => (
          <div key={rate} style={{ display: "contents" }}>
            <dt>USt {Math.round(Number(rate) * 100)} %</dt>
            <dd>{fmtEur(amount)}</dd>
          </div>
        ))}
        <dt>USt gesamt</dt>
        <dd>{fmtEur(inv.tax_total)}</dd>
        <dt>
          <strong>Brutto</strong>
        </dt>
        <dd>
          <strong>{fmtEur(inv.gross_total)}</strong>
        </dd>
      </dl>
    </>
  );
}
