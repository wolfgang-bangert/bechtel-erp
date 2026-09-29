"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePayrollExtf } from "@/lib/payroll/parseExtf";

export type UploadState = { ok?: boolean; error?: string; importId?: string };
export type LinkState = { ok?: boolean; error?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function uploadPayroll(_prev: UploadState, fd: FormData): Promise<UploadState> {
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Datei wählen." };

  let parsed: ReturnType<typeof parsePayrollExtf>;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parsePayrollExtf(buf);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Datei konnte nicht gelesen werden." };
  }
  if (!parsed.rows.length) return { error: "Keine Buchungszeilen in der Datei gefunden." };

  const supabase = await createClient();
  const { data: imp, error: impErr } = await supabase
    .from("payroll_import")
    .insert({
      file_name: file.name,
      period_start: parsed.meta.periodStart,
      period_end: parsed.meta.periodEnd,
      mandanten_nr: parsed.meta.mandantenNr,
      row_count: parsed.rows.length,
    })
    .select("id")
    .single();
  if (impErr || !imp) return { error: impErr?.message ?? "Import konnte nicht angelegt werden." };

  const { error: rowsErr } = await supabase.from("payroll_booking").insert(
    parsed.rows.map((r) => ({
      import_id: imp.id,
      position: r.position,
      amount: r.amount,
      soll_haben: r.soll_haben,
      konto: r.konto,
      gegenkonto: r.gegenkonto,
      bu_schluessel: r.bu_schluessel,
      beleg_datum: r.beleg_datum,
      belegfeld1: r.belegfeld1,
      belegfeld2: r.belegfeld2,
      buchungstext: r.buchungstext,
      kost1: r.kost1,
      kost2: r.kost2,
      raw: r.raw,
    })),
  );
  if (rowsErr) {
    await supabase.from("payroll_import").delete().eq("id", imp.id);
    return { error: rowsErr.message };
  }

  revalidatePath("/lohnbuchungen");
  return { ok: true, importId: imp.id };
}

/** Verbleibenden, noch nicht zugeordneten Betrag einer Buchung ermitteln -
 *  wie bank/actions.ts, hier lokal (eigene Server-Action-Datei je Route). */
async function remainingAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  txId: string,
): Promise<{ amount: number; remaining: number } | { error: string }> {
  const { data: tx, error: te } = await supabase
    .from("bank_transaction")
    .select("amount")
    .eq("id", txId)
    .single();
  if (te || !tx) return { error: "Umsatz nicht gefunden." };
  const { data: existing } = await supabase
    .from("bank_transaction_match")
    .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const allocated = r2(
    (existing ?? [])
      .filter((m) => !(m.ledger_account && (m.sales_invoice_id || m.incoming_document_id)))
      .reduce((s, m) => s + Math.abs(m.amount ?? 0), 0),
  );
  return { amount: tx.amount, remaining: r2(Math.abs(tx.amount) - allocated) };
}

/** Lohnbuchung (z.B. "Überweisung" gegen Verbindlichkeiten 1740) mit der
 *  Bankzeile verknüpfen, die das Geld tatsächlich bewegt hat - legt eine
 *  bank_transaction_match-Zeile mit ledger_account (das Verbindlichkeiten-
 *  Konto) + payroll_booking_id an, wie bei Rechnung/Eingangsrechnung. */
export async function linkPayrollBooking(_prev: LinkState, fd: FormData): Promise<LinkState> {
  const bookingId = String(fd.get("booking_id") ?? "");
  const txId = String(fd.get("tx_id") ?? "");
  if (!bookingId || !txId) return { error: "Buchung oder Umsatz fehlt." };

  const supabase = await createClient();
  const { data: booking, error: be } = await supabase
    .from("payroll_booking")
    .select("id, amount, gegenkonto, buchungstext")
    .eq("id", bookingId)
    .maybeSingle();
  if (be || !booking) return { error: be?.message ?? "Lohnbuchung nicht gefunden." };

  const r = await remainingAmount(supabase, txId);
  if ("error" in r) return r;

  const { error } = await supabase.from("bank_transaction_match").insert({
    bank_transaction_id: txId,
    ledger_account: booking.gegenkonto,
    payroll_booking_id: booking.id,
    note: booking.buchungstext,
    amount: r.amount < 0 ? -booking.amount : booking.amount,
    auto: false,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "Diese Lohnbuchung ist schon verknüpft." : error.message,
    };
  }

  const { data: after } = await supabase
    .from("bank_transaction_match")
    .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const nowAllocated = r2(
    (after ?? [])
      .filter((m) => !(m.ledger_account && (m.sales_invoice_id || m.incoming_document_id)))
      .reduce((s, m) => s + Math.abs(m.amount ?? 0), 0),
  );
  await supabase
    .from("bank_transaction")
    .update({ match_status: nowAllocated + 0.005 >= Math.abs(r.amount) ? "matched" : "partial" })
    .eq("id", txId);

  revalidatePath("/lohnbuchungen");
  revalidatePath("/bank");
  return { ok: true };
}
