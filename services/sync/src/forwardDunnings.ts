import { env } from "./env";
import { supabase } from "./supabase";
import { getObjectBytes } from "./storage";
import { mailerConfigured, sendMail } from "./mailer";

type Options = { dryRun?: boolean; quiet?: boolean };

const SUBJECT_TAG = "WEITERLEITUNG VON rechnungen@bechtel-druck.de";

type Row = {
  id: string;
  supplier_name: string | null;
  doc_number: string | null;
  gross_amount: number | null;
  currency: string | null;
  advice_reference: string[] | null;
  email_subject: string | null;
  email_from: string | null;
  email_date: string | null;
  file_name: string | null;
  pdf_storage_key: string | null;
  extraction: Record<string, unknown> | null;
};

/**
 * Leitet erkannte Mahnungen (doc_type='dunning', noch nicht weitergeleitet) per
 * E-Mail an DUNNING_FORWARD_TO weiter — Original-PDF im Anhang, Betreff mit
 * vorangestelltem Hinweis. Ohne SMTP-/Ziel-Konfiguration passiert nichts.
 */
export async function forwardDunnings(opts: Options = {}) {
  const { dryRun = false, quiet = false } = opts;
  const to = env.dunningForwardTo();

  if (!to || !mailerConfigured()) {
    if (!quiet) {
      console.log(
        `Mahnungs-Weiterleitung inaktiv (${!to ? "DUNNING_FORWARD_TO fehlt" : "SMTP_* fehlt"}).`,
      );
    }
    return { pending: 0, sent: 0, skipped: 0, inactive: true };
  }

  const { data, error } = await supabase
    .from("incoming_document")
    .select(
      "id, supplier_name, doc_number, gross_amount, currency, advice_reference, email_subject, email_from, email_date, file_name, pdf_storage_key, extraction",
    )
    .eq("doc_type", "dunning")
    .is("forwarded_at", null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  if (!quiet || rows.length) {
    console.log(`${rows.length} Mahnung(en) weiterleiten → ${to}${dryRun ? "  (DRY RUN)" : ""}`);
  }

  let sent = 0;
  let skipped = 0;
  for (const r of rows) {
    const origSubject = r.email_subject?.trim() || `Mahnung ${r.supplier_name ?? ""}`.trim();
    const subject = `${SUBJECT_TAG}: ${origSubject}`;
    const ref = (r.advice_reference ?? []).join(", ") || r.doc_number || "unbekannt";
    const dun = (r.extraction?.dunning ?? {}) as Record<string, unknown>;
    const body = [
      `Weitergeleitete Mahnung aus dem Postfach rechnungen@bechtel-druck.de.`,
      ``,
      `Lieferant:        ${r.supplier_name ?? "?"}`,
      `Betrifft Rechnung: ${ref}`,
      `Mahnstufe:        ${dun.level ?? "?"}`,
      `Betrag:           ${r.gross_amount ?? "?"} ${r.currency ?? ""}`,
      `Mahngebühr:       ${dun.dunning_fee ?? "-"}`,
      `Frist:            ${dun.deadline ?? "-"}`,
      `Original von:     ${r.email_from ?? "?"} am ${r.email_date ?? "?"}`,
      ``,
      `Das Original-PDF hängt an.`,
    ].join("\n");

    if (dryRun) {
      console.log(`  [DRY] ${subject}`);
      continue;
    }

    try {
      const attachments = r.pdf_storage_key
        ? [
            {
              filename: r.file_name || "Mahnung.pdf",
              content: await getObjectBytes(r.pdf_storage_key),
              contentType: "application/pdf",
            },
          ]
        : undefined;
      await sendMail({ to, subject, text: body, attachments });
      await supabase
        .from("incoming_document")
        .update({ forwarded_at: new Date().toISOString() })
        .eq("id", r.id);
      sent += 1;
      console.log(`  ✓ ${subject}`);
    } catch (err) {
      skipped += 1;
      const m = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${origSubject}: ${m}`);
    }
  }

  return { pending: rows.length, sent, skipped, inactive: false };
}
