import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LaufStatusButtons } from "./LaufStatusButtons";

export const dynamic = "force-dynamic";
const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ZahlungslaufDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: l } = await supabase
    .from("payment_batch")
    .select("id, msg_id, debtor_name, debtor_iban, execution_date, format, item_count, total, status, created_at, submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (!l) notFound();
  const { data: items } = await supabase
    .from("payment_batch_item")
    .select("id, incoming_document_id, creditor_name, creditor_iban, amount, skonto_amount, remittance")
    .eq("batch_id", id)
    .order("creditor_name");

  return (
    <>
      <p className="lead"><Link href="/zahlungen">← Zahlungen</Link></p>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Zahlungslauf {l.msg_id} <span className="tag">{l.status}</span></h1>
      </div>
      <p className="lead">
        {l.item_count} Zahlungen, <strong>{eur(Number(l.total))} €</strong> von {l.debtor_iban}, Ausführung am{" "}
        {String(l.execution_date).split("-").reverse().join(".")} · Format {l.format}
      </p>
      <div className="toolbar" style={{ gap: 12, flexWrap: "wrap" }}>
        <a href={`/api/zahlungen/${l.id}/xml`}>SEPA-Datei (XML) herunterladen</a>
        <LaufStatusButtons id={l.id} status={l.status as string} />
      </div>
      <p className="count">
        Im Online-Banking unter „Überweisung per Datei/Sammelüberweisung hochladen“ die XML-Datei auswählen und mit der TAN
        freigeben. Danach hier „Bei der Bank eingereicht“ markieren. Die Zahlungen ordnet die Bank-Zuordnung automatisch zu,
        sobald sie auf dem Konto erscheinen.
      </p>
      <div className="table-scroll" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr><th>Empfänger</th><th>IBAN</th><th>Verwendungszweck</th><th style={{ textAlign: "right" }}>Skonto</th><th style={{ textAlign: "right" }}>Betrag</th></tr>
          </thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id}>
                <td className="wrap">{i.incoming_document_id ? <Link href={`/eingangsrechnungen/${i.incoming_document_id}`}>{i.creditor_name}</Link> : i.creditor_name}</td>
                <td className="count">{i.creditor_iban}</td>
                <td className="wrap count">{i.remittance}</td>
                <td style={{ textAlign: "right" }} className="count">{Number(i.skonto_amount) > 0 ? `${eur(Number(i.skonto_amount))} €` : ""}</td>
                <td style={{ textAlign: "right" }}>{eur(Number(i.amount))} €</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} style={{ textAlign: "right", fontWeight: 600 }}>Summe</td><td style={{ textAlign: "right", fontWeight: 600 }}>{eur(Number(l.total))} €</td></tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
