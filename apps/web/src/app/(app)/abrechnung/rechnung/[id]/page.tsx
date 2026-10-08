import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { AbschliessenButton } from "./AbschliessenButton";
import { MailButton } from "./MailButton";

export const dynamic = "force-dynamic";

export default async function RechnungDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: rechnung } = await supabase
    .from("invoice")
    .select(
      "id, invoice_number, status, invoice_date, net_total, tax_total, gross_total, pdf_storage_key, finalized_at, mail_status, mail_to, mail_sent_at, mail_error, organization:organization_id(name, invoice_email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!rechnung) notFound();

  const orgRaw = rechnung.organization as unknown as
    | { name: string; invoice_email: string | null }[]
    | { name: string; invoice_email: string | null }
    | null;
  const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
  const orgName = org?.name;
  const invoiceEmail = org?.invoice_email?.trim() || null;

  const { data: items } = await supabase
    .from("invoice_item")
    .select("id, position, description, net_amount, tax_amount, gross_amount, abrechnung_id")
    .eq("invoice_id", id)
    .order("position");

  const pdfUrl = rechnung.pdf_storage_key
    ? await signedGetUrl(rechnung.pdf_storage_key, 1800, `${rechnung.invoice_number}.pdf`)
    : null;
  const locked = rechnung.status === "festgeschrieben";

  return (
    <>
      <p className="lead">
        <Link href="/abrechnung">← Wochen-Abrechnung</Link>
      </p>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>
          {rechnung.invoice_number ?? "Sammelrechnung (offen)"} <span className="tag">{rechnung.status}</span>
        </h1>
      </div>
      <p className="lead">
        {orgName}
        {rechnung.invoice_date ? ` · Rechnungsdatum ${rechnung.invoice_date}` : ""} · Summe{" "}
        <strong>{Number(rechnung.gross_total).toFixed(2)} € brutto</strong> (
        {Number(rechnung.net_total).toFixed(2)} € netto + {Number(rechnung.tax_total).toFixed(2)} € USt.)
      </p>

      {!locked && (
        <div className="toolbar" style={{ gap: 8 }}>
          <AbschliessenButton id={rechnung.id} />
          <span className="count">
            Erzeugt Rechnungsnummer, ZUGFeRD-PDF (mit eingebetteter Auftrags-CSV) - danach keine
            weiteren Positionen mehr möglich.
          </span>
        </div>
      )}
      {locked && pdfUrl && (
        <div className="toolbar" style={{ gap: 12 }}>
          <a href={pdfUrl} target="_blank" rel="noreferrer">
            Rechnungs-PDF (ZUGFeRD) herunterladen
          </a>
          <Link href={`/api/rechnung/${rechnung.id}/csv`}>CSV separat herunterladen</Link>
        </div>
      )}
      {locked && (
        <div className="toolbar" style={{ gap: 12, flexWrap: "wrap" }}>
          {rechnung.mail_status === "gesendet" ? (
            <span className="msg-ok">
              ✓ Per E-Mail gesendet an {rechnung.mail_to}
              {rechnung.mail_sent_at ? ` am ${rechnung.mail_sent_at.slice(0, 16).replace("T", " ")}` : ""}
            </span>
          ) : rechnung.mail_status === "vorgemerkt" ? (
            <span className="count">Versand an {rechnung.mail_to} vorgemerkt – wird in Kürze gesendet.</span>
          ) : invoiceEmail ? (
            <MailButton
              id={rechnung.id}
              to={invoiceEmail}
              label={rechnung.mail_status === "fehler" ? "Erneut per E-Mail senden" : `Per E-Mail senden an ${invoiceEmail}`}
            />
          ) : (
            <span className="count">
              Keine Rechnungs-E-Mail hinterlegt – bitte bei der Organisation (Onlineprinters) eintragen, dann kann die
              Rechnung hier per E-Mail versendet werden.
            </span>
          )}
          {rechnung.mail_status === "fehler" && <span className="msg-err">Letzter Versand fehlgeschlagen: {rechnung.mail_error}</span>}
        </div>
      )}

      <div className="table-scroll" style={{ marginTop: 14 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Beschreibung</th>
              <th style={{ textAlign: "right" }}>Netto</th>
              <th style={{ textAlign: "right" }}>USt.</th>
              <th style={{ textAlign: "right" }}>Brutto</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id}>
                <td className="count">{i.position}</td>
                <td className="wrap">
                  {i.abrechnung_id ? (
                    <Link href={`/abrechnung/${i.abrechnung_id}`}>{i.description}</Link>
                  ) : (
                    i.description
                  )}
                </td>
                <td style={{ textAlign: "right" }}>{Number(i.net_amount).toFixed(2)} €</td>
                <td style={{ textAlign: "right" }}>{Number(i.tax_amount).toFixed(2)} €</td>
                <td style={{ textAlign: "right" }}>{Number(i.gross_amount).toFixed(2)} €</td>
              </tr>
            ))}
            {!items?.length && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>Keine Positionen.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
