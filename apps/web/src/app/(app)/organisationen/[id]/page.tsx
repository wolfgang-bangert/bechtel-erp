import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { DOKUMENT_KATEGORIEN, istDokumentKategorie } from "@/lib/dokumente";
import { setInvoiceEmailAction } from "./actions";
import { KorbKnopf, KorbLeiste } from "../Warenkorb";
import { akontoPosten, offeneRechnungen } from "@/lib/akonto";
import { AkontoVerrechnen } from "./AkontoVerrechnen";

export const dynamic = "force-dynamic";

const RELATION_LABEL: Record<string, string> = {
  customer: "Kunde",
  supplier: "Lieferant",
  both: "Kunde + Lieferant",
};

export default async function OrganisationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ verschmolzen?: string }>;
}) {
  const { id } = await params;
  const verschmolzen = ((await searchParams).verschmolzen ?? "").split(",").filter(Boolean);
  const supabase = await createClient();

  const [
    { data: org, error },
    { data: refs },
    { data: addresses },
    { data: contacts },
    { data: orders, count: orderCount },
    { data: invoices, count: invoiceCount },
    { data: dokumente, count: dokumentCount },
  ] = await Promise.all([
    supabase.from("organization").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("organization_external_ref")
      .select("system, external_id, is_authoritative, synced_at, metadata")
      .eq("organization_id", id),
    supabase
      .from("address")
      .select("kind, is_default, line1, line2, street, house_number, address_addition, zip, city, country")
      .eq("organization_id", id),
    supabase
      .from("contact")
      .select("first_name, last_name, email, phone, position, is_primary")
      .eq("organization_id", id),
    supabase
      .from("sales_order")
      .select("id, order_number, order_date, state, net_total, source", { count: "exact" })
      .eq("organization_id", id)
      .order("order_date", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("sales_invoice")
      .select("id, invoice_number, invoice_date, gross_total, kind, source", { count: "exact" })
      .eq("organization_id", id)
      .order("invoice_date", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("dokument")
      .select("id, kategorie, titel, dokument_datum, created_at", { count: "exact" })
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (error) {
    return <div className="banner-err">Fehler: {error.message}</div>;
  }

  // Akonto-Zahlungen (ohne Rechnung) und offene Rechnungen zum Verrechnen
  const akonto = await akontoPosten(supabase, id);
  const akontoSumme = akonto.reduce((s, p) => s + p.betrag, 0);
  const akontoEingang = akonto.some((p) => p.eingang);
  let offenSumme = 0;
  let offenAnzahl = 0;
  if (akonto.length) {
    // nur echte offene Posten: vor 2026 laut OP-Vortrag (BuchhaltungsButler), ab 2026 aus werk
    const off = await offeneRechnungen(supabase, id, akontoEingang);
    offenAnzahl = off.length;
    offenSumme = off.reduce((s, r) => s + r.offen, 0);
  }
  if (!org) notFound();

  return (
    <>
      <p className="lead">
        <Link href="/organisationen">← Organisationen</Link>
      </p>
      {verschmolzen.length > 1 && (
        <div className="banner-info">
          {verschmolzen.length - 1} Organisation(en) in diese verschmolzen. Alle Verknüpfungen hängen jetzt hier.
        </div>
      )}
      <KorbLeiste entfernen={verschmolzen} />
      <h1 style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {org.name}
        <span style={{ fontSize: 14, fontWeight: 400 }}>
          <KorbKnopf id={org.id} name={org.name} />
        </span>
      </h1>
      <p className="lead">
        {RELATION_LABEL[org.relation] ?? org.relation}
        {org.customer_segment ? ` · Segment ${org.customer_segment}` : ""}
        {org.angelegt_durch && (
          <>
            {" · "}
            <span className="tag" title="Von werk automatisch angelegt – Angaben prüfen, Dubletten über den Warenkorb verschmelzen">
              automatisch angelegt aus {org.angelegt_durch === "dokument" ? "einem Dokument" : "einer Eingangsrechnung"}
            </span>
          </>
        )}
      </p>

      {akonto.length > 0 && (
        <>
          <h2>Akonto-Zahlungen</h2>
          <div className="banner-info">
            {akonto.length} Zahlung(en) ohne Rechnungsbezug, zusammen <strong>{fmtEur(akontoSumme)}</strong>. Offene{" "}
            {akontoEingang ? "Ausgangsrechnungen" : "Eingangsrechnungen"}: {fmtEur(offenSumme)} ({offenAnzahl}) – vor 2026 nur
            die offenen Posten zum 31.12.2025 laut BuchhaltungsButler.
          </div>
          <div className="rows" style={{ margin: "8px 0" }}>
            {akonto.map((p) => (
              <div key={p.matchId} className="row">
                <span>{fmtDate(p.datum)}</span>
                <Link href={`/bank?tx=${p.txId}`}>Bankzeile</Link>
                <span className="count" style={{ marginLeft: "auto" }}>{fmtEur(p.betrag)}</span>
              </div>
            ))}
          </div>
          {offenAnzahl > 0 && <AkontoVerrechnen id={org.id} summe={fmtEur(akontoSumme)} offen={fmtEur(offenSumme)} />}
        </>
      )}

      <h2>Stammdaten</h2>
      <dl className="kv">
        <dt>Anzeigename</dt>
        <dd>{org.name}</dd>
        <dt>Rechtsform / Firmierung</dt>
        <dd>{org.legal_name || "–"}</dd>
        <dt>Debitorennummer</dt>
        <dd>{org.customer_number || "–"}</dd>
        <dt>Kreditorennummer</dt>
        <dd>{org.supplier_number || "–"}</dd>
        <dt>USt-IdNr</dt>
        <dd>
          {org.vat_id || "–"}
          {org.vat_id_valid === true ? " ✓" : org.vat_id_valid === false ? " (ungültig)" : ""}
        </dd>
        <dt>Steuerland</dt>
        <dd>{org.tax_country}</dd>
        <dt>Steuerbehandlung</dt>
        <dd>{org.default_tax_treatment}</dd>
        <dt>E-Mail</dt>
        <dd>{org.email || "–"}</dd>
        <dt>Rechnungs-E-Mail</dt>
        <dd>
          <form action={setInvoiceEmailAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="hidden" name="id" value={org.id} />
            <input
              type="email"
              name="invoice_email"
              defaultValue={org.invoice_email ?? ""}
              placeholder="Empfänger für den Rechnungsversand"
              style={{ minWidth: 280 }}
            />
            <button type="submit" className="ghost" style={{ padding: "3px 10px" }}>
              Speichern
            </button>
          </form>
        </dd>
        <dt>Mahnsperre</dt>
        <dd>{org.dunning_enabled ? "nein" : "ja"}</dd>
      </dl>

      <h2>Vorkontierung</h2>
      <dl className="kv">
        <dt>Aufwandskonto (Eingangsrechnungen)</dt>
        <dd>{org.default_expense_account || "–"}</dd>
        <dt>Erlöskonto (Ausgangsrechnungen)</dt>
        <dd>{org.default_revenue_account || "–"}</dd>
        <dt>Zahlart</dt>
        <dd>
          {org.default_payment_method
            ? ({ card: "Kreditkarte", paypal: "PayPal", transfer: "Überweisung", direct_debit: "Lastschrift" } as Record<string, string>)[
                org.default_payment_method
              ] ?? org.default_payment_method
            : "–"}
        </dd>
        <dt>Lieferant aus dem Ausland</dt>
        <dd>
          {org.foreign_supply_kind === "service"
            ? "Dienstleistung (Reverse Charge §13b automatisch)"
            : org.foreign_supply_kind === "goods"
              ? "Ware (kein §13b, USt von Hand)"
              : "Standard (USD-Rechnung ohne USt = Dienstleistung)"}
        </dd>
        <dt>Gutschriftverfahren</dt>
        <dd>{org.gutschriftverfahren ? "ja - Abrechnungen dieses Kunden werden als Ausgangsrechnung übernommen" : "nein"}</dd>
        <dt>Herkunft</dt>
        <dd>
          {org.vorkontierung_source === "learned"
            ? `gelernt${org.vorkontierung_confidence != null ? ` (Konfidenz ${Math.round(org.vorkontierung_confidence * 100)} %)` : ""}`
            : org.vorkontierung_source === "manual"
              ? "manuell"
              : "–"}
        </dd>
      </dl>
      <p className="lead">
        <Link href={`/einstellungen/vorkontierung/${org.id}`}>Vorkontierung bearbeiten →</Link>
      </p>

      <h2>Herkunft / Fremdsysteme</h2>
      {(refs ?? []).length === 0 ? (
        <p className="lead">In werk angelegt, keine Fremdsystem-Zuordnung.</p>
      ) : (
        <div className="rows">
          {(refs ?? []).map((r) => (
            <div className="row" key={`${r.system}:${r.external_id}`}>
              <span className="w-code">
                <strong>{r.system}</strong>
              </span>
              <span className="w-code">{r.external_id}</span>
              {r.is_authoritative && <span className="tag">führend</span>}
              <span className="count" style={{ fontSize: 12, color: "var(--muted)" }}>
                {r.metadata && Object.keys(r.metadata).length > 0
                  ? Object.entries(r.metadata)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join("  ·  ")
                  : ""}
              </span>
              <span className="count" style={{ fontSize: 12 }}>
                {r.synced_at ? `Sync ${new Date(r.synced_at).toLocaleString("de-DE")}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2>Adressen</h2>
      {(addresses ?? []).length === 0 ? (
        <p className="lead">Noch keine Adressen (Sync folgt).</p>
      ) : (
        <div className="rows">
          {(addresses ?? []).map((a, i) => (
            <div className="row" key={i}>
              <span className="w-code">{a.kind}</span>
              <span className="w-name">
                {[
                  [a.street ?? a.line1, a.house_number].filter(Boolean).join(" "),
                  a.address_addition ?? a.line2,
                  [a.zip, a.city].filter(Boolean).join(" "),
                  a.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              {a.is_default && <span className="tag">Standard</span>}
            </div>
          ))}
        </div>
      )}

      <h2>Kontakte</h2>
      {(contacts ?? []).length === 0 ? (
        <p className="lead">Noch keine Kontakte (Sync folgt).</p>
      ) : (
        <div className="rows">
          {(contacts ?? []).map((c, i) => (
            <div className="row" key={i}>
              <span className="w-name">
                {c.first_name} {c.last_name}
                {c.position ? ` · ${c.position}` : ""}
              </span>
              <span className="count">{c.email || ""}</span>
              <span className="count">{c.phone || ""}</span>
              {c.is_primary && <span className="tag">primär</span>}
            </div>
          ))}
        </div>
      )}

      <h2>
        Aufträge{" "}
        <span className="count" style={{ fontWeight: 400 }}>
          ({orderCount ?? 0})
        </span>
      </h2>
      {(orders ?? []).length === 0 ? (
        <p className="lead">Keine.</p>
      ) : (
        <div className="rows">
          {(orders ?? []).map((o) => (
            <div className="row" key={o.id}>
              <span className="w-code">
                <Link href={`/auftraege/${o.id}`}>{o.order_number ?? o.id.slice(0, 8)}</Link>
              </span>
              <span>{fmtDate(o.order_date)}</span>
              <span className="count">{o.state ?? ""}</span>
              <span className="count" style={{ marginLeft: "auto" }}>{fmtEur(o.net_total)}</span>
              <span className="tag">{o.source}</span>
            </div>
          ))}
          {(orderCount ?? 0) > 8 && (
            <Link href={`/auftraege?q=`}>alle {orderCount} Aufträge …</Link>
          )}
        </div>
      )}

      <h2>
        Rechnungen{" "}
        <span className="count" style={{ fontWeight: 400 }}>
          ({invoiceCount ?? 0})
        </span>
      </h2>
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
              <span className="count" style={{ marginLeft: "auto" }}>{fmtEur(inv.gross_total)}</span>
              <span className="tag">{inv.source}</span>
            </div>
          ))}
        </div>
      )}

      <h2>
        Dokumente{" "}
        <span className="count" style={{ fontWeight: 400 }}>
          ({dokumentCount ?? 0})
        </span>
      </h2>
      {(dokumente ?? []).length === 0 ? (
        <p className="lead">Keine.</p>
      ) : (
        <div className="rows">
          {(dokumente ?? []).map((d) => (
            <div className="row" key={d.id}>
              <span>{fmtDate(d.dokument_datum ?? d.created_at)}</span>
              <a href={`/dokumente/${d.id}/pdf`} target="_blank" rel="noreferrer">
                {d.titel}
              </a>
              <span className="tag" style={{ marginLeft: "auto" }}>
                {istDokumentKategorie(d.kategorie) ? DOKUMENT_KATEGORIEN[d.kategorie] : d.kategorie}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
