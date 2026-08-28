import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur, fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuftragDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: order, error }, { data: items }, { data: invoices }] = await Promise.all([
    supabase
      .from("sales_order")
      .select(
        "*, organization:organization(id, name), contact:contact(first_name, last_name, email)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sales_order_item")
      .select("position, description, kind, quantity, unit_price, net_amount")
      .eq("sales_order_id", id)
      .order("position", { nullsFirst: false }),
    supabase
      .from("sales_invoice")
      .select("id, invoice_number, invoice_date, gross_total, kind")
      .eq("sales_order_id", id)
      .order("invoice_date"),
  ]);

  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!order) notFound();

  const org = order.organization as unknown as { id: string; name: string } | null;
  const contact = order.contact as unknown as
    | { first_name: string; last_name: string; email: string | null }
    | null;

  return (
    <>
      <p className="lead">
        <Link href="/auftraege">← Aufträge</Link>
      </p>
      <h1>Auftrag {order.order_number ?? id.slice(0, 8)}</h1>
      <p className="lead">
        {order.source} · {order.state ?? "ohne Status"}
      </p>

      <dl className="kv">
        <dt>Organisation</dt>
        <dd>{org ? <Link href={`/organisationen/${org.id}`}>{org.name}</Link> : "–"}</dd>
        <dt>Ansprechpartner</dt>
        <dd>
          {contact
            ? `${contact.first_name} ${contact.last_name}${contact.email ? ` · ${contact.email}` : ""}`
            : "–"}
        </dd>
        <dt>Auftragsdatum</dt>
        <dd>{fmtDate(order.order_date)}</dd>
        <dt>Liefertermin</dt>
        <dd>{fmtDate(order.delivery_date)}</dd>
        <dt>Netto</dt>
        <dd>{fmtEur(order.net_total)}</dd>
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
              <th style={{ textAlign: "right" }}>Netto</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it, i) => (
              <tr key={i}>
                <td>{it.position ?? i + 1}</td>
                <td className="wrap">
                  {it.description ?? "–"}
                  {it.kind ? <span className="tag" style={{ marginLeft: 6 }}>{it.kind}</span> : null}
                </td>
                <td style={{ textAlign: "right" }}>{fmtNumber(it.quantity, 0)}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(it.unit_price)}</td>
                <td style={{ textAlign: "right" }}>{fmtEur(it.net_amount)}</td>
              </tr>
            ))}
            {(items ?? []).length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Keine Positionen gespiegelt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Rechnungen zu diesem Auftrag</h2>
      {(invoices ?? []).length === 0 ? (
        <p className="lead">Keine.</p>
      ) : (
        <div className="rows">
          {(invoices ?? []).map((inv) => (
            <div className="row" key={inv.id}>
              <span className="w-code">
                <Link href={`/rechnungen/${inv.id}`}>
                  {inv.invoice_number ?? inv.id.slice(0, 8)}
                </Link>
              </span>
              <span>{fmtDate(inv.invoice_date)}</span>
              {inv.kind === "credit_note" && <span className="tag">Gutschrift</span>}
              <span className="count" style={{ marginLeft: "auto" }}>
                {fmtEur(inv.gross_total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
