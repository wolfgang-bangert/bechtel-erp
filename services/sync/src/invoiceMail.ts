import { supabase } from "./supabase";
import { getObjectBytes } from "./storage";
import { mailerConfigured, sendMail } from "./mailer";
import { erzeugeOnlineprintersCsv } from "@werk/shared/fakturierung/csv";

type Options = { dryRun?: boolean };

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Versendet abgeschlossene werk-Rechnungen (invoice.mail_status = 'vorgemerkt') per E-Mail
 * mit PDF (ZUGFeRD) und Auftrags-CSV im Anhang. Vorgemerkt wird nur auf Klick in der Oberfläche.
 * Absender: INVOICE_MAIL_FROM (Standard m.weber@bechtel-druck.de), Kopie an den Absender.
 */
export async function sendInvoiceMails(opts: Options = {}) {
  const { dryRun = false } = opts;
  const { data: rows, error } = await supabase
    .from("invoice")
    .select("id, invoice_number, invoice_date, gross_total, net_total, pdf_storage_key, mail_to, organization:organization_id(name)")
    .eq("mail_status", "vorgemerkt");
  if (error) throw new Error(`invoice lesen: ${error.message}`);
  if (!rows?.length) return { pending: 0, sent: 0, failed: 0 };
  if (!mailerConfigured()) return { pending: rows.length, sent: 0, failed: 0, inactive: "SMTP_* fehlt" };

  const from = (process.env.INVOICE_MAIL_FROM || "m.weber@bechtel-druck.de").trim();
  const { data: setting } = await supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle();
  const profile = (setting?.value ?? {}) as { name?: string; legal_name?: string };
  const firma = profile.legal_name || profile.name || "Bechtel Druck";

  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const nr = r.invoice_number as string;
    const to = (r.mail_to as string | null)?.trim();
    if (!to || !r.pdf_storage_key || !r.invoice_date) {
      await supabase.from("invoice").update({ mail_status: "fehler", mail_error: "Empfänger, PDF oder Rechnungsdatum fehlt" }).eq("id", r.id);
      failed += 1;
      continue;
    }
    const { data: abrs } = await supabase.from("abrechnung").select("id").eq("invoice_id", r.id);
    const ids = (abrs ?? []).map((a) => a.id as string);
    const { data: pos } = ids.length
      ? await supabase.from("abrechnung_position").select("referenz, betrag_netto").in("abrechnung_id", ids)
      : { data: [] };
    const csv = erzeugeOnlineprintersCsv(
      (pos ?? []).filter((p) => p.referenz).map((p) => ({ order_number: p.referenz as string, order_price: Number(p.betrag_netto) })),
      nr,
      r.invoice_date as string,
    );

    const subject = `Rechnung ${nr} – ${firma}`;
    const text = [
      "Guten Tag,",
      "",
      `anbei erhalten Sie unsere Rechnung ${nr} vom ${datumDe(r.invoice_date as string)} über ${eur(Number(r.gross_total))} € brutto (${eur(Number(r.net_total))} € netto).`,
      "Die Aufstellung der abgerechneten Aufträge mit Begründungen zu Abweichungen finden Sie auf den Folgeseiten der Rechnung; die Auftragsliste liegt zusätzlich als CSV bei.",
      "",
      "Bitte überweisen Sie den Betrag auf das in der Rechnung genannte Konto.",
      "",
      "Mit freundlichen Grüßen",
      firma,
    ].join("\n");

    if (dryRun) {
      console.log(`  [DRY] ${subject} → ${to} (von ${from})`);
      continue;
    }
    try {
      await sendMail({
        to,
        from,
        bcc: from,
        subject,
        text,
        attachments: [
          { filename: `${nr}.pdf`, content: await getObjectBytes(r.pdf_storage_key as string), contentType: "application/pdf" },
          { filename: `${nr}.csv`, content: Buffer.from(csv, "utf-8"), contentType: "text/csv" },
        ],
      });
      await supabase.from("invoice").update({ mail_status: "gesendet", mail_sent_at: new Date().toISOString(), mail_error: null }).eq("id", r.id);
      sent += 1;
      console.log(`  ✓ ${subject} → ${to}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await supabase.from("invoice").update({ mail_status: "fehler", mail_error: m.slice(0, 500) }).eq("id", r.id);
      failed += 1;
      console.error(`  ✗ ${subject}: ${m}`);
    }
  }
  return { pending: rows.length, sent, failed };
}
