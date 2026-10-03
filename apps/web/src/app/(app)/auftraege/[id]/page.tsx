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

  // Eingangsrechnungen (Einkauf/Kosten), deren Positionen diesem Auftrag zugeordnet sind -
  // per Verknüpfung oder (noch nicht verknüpft) über die gelesene Referenz als Text.
  const plain = (order.order_number ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const dashed = /^[A-Z0-9]{6}$/.test(plain) ? plain.match(/../g)!.join("-") : plain;
  const { data: allocs } = await supabase
    .from("incoming_document_allocation")
    .select(
      "id, amount, incoming_document_item:incoming_document_item_id ( description, incoming_document:incoming_document_id ( id, doc_number, supplier_name, doc_date, status, doc_type ) )",
    )
    .or(`sales_order_id.eq.${id}${plain ? `,order_ref.in.(${dashed},${plain})` : ""}`);
  type AllocRow = {
    id: string;
    amount: number | null;
    incoming_document_item: {
      description: string | null;
      incoming_document: {
        id: string;
        doc_number: string | null;
        supplier_name: string | null;
        doc_date: string | null;
        status: string;
        doc_type: string;
      } | null;
    } | null;
  };
  const costs = ((allocs ?? []) as unknown as AllocRow[]).filter(
    (a) => a.incoming_document_item?.incoming_document && a.incoming_document_item.incoming_document.status !== "rejected",
  );
  const costSum = costs.reduce(
    (sum, a) =>
      sum +
      (a.incoming_document_item!.incoming_document!.doc_type === "credit_note"
        ? -Math.abs(a.amount ?? 0)
        : (a.amount ?? 0)),
    0,
  );

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

      <h2>Eingangsrechnungen (Einkauf) zu diesem Auftrag</h2>
      {costs.length === 0 ? (
        <p className="lead">Keine.</p>
      ) : (
        <>
          <div className="rows">
            {costs.map((a) => {
              const d = a.incoming_document_item!.incoming_document!;
              return (
                <div className="row" key={a.id}>
                  <span className="w-code">
                    <Link href={`/eingangsrechnungen/${d.id}`}>{d.doc_number ?? d.id.slice(0, 8)}</Link>
                  </span>
                  <span>{d.supplier_name ?? "–"}</span>
                  <span>{fmtDate(d.doc_date)}</span>
                  <span className="count" style={{ whiteSpace: "pre-line", flex: 1 }}>
                    {(a.incoming_document_item!.description ?? "").split("\n")[0]}
                  </span>
                  <span className="count" style={{ marginLeft: "auto" }}>
                    {fmtEur(d.doc_type === "credit_note" ? -Math.abs(a.amount ?? 0) : a.amount)} netto
                  </span>
                </div>
              );
            })}
          </div>
          <p className="lead">Summe Einkaufskosten (netto): <strong>{fmtEur(costSum)}</strong></p>
        </>
      )}

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
