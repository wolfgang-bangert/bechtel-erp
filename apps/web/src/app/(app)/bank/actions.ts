"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { putObject, deleteObject } from "@/lib/storage";

export type MatchState = { ok?: boolean; error?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

function revalidateAll() {
  revalidatePath("/bank");
  revalidatePath("/offene-posten");
  revalidatePath("/eingangsrechnungen");
}

export async function matchTransaction(
  _prev: MatchState,
  formData: FormData,
): Promise<MatchState> {
  const txId = String(formData.get("tx_id") ?? "");
  const side = String(formData.get("side") ?? "debitor");
  const rawInput =
    String(formData.get("invoice_number") ?? "").trim() ||
    String(formData.get("invoice_number_manual") ?? "").trim();
  const number = rawInput.split(/\s+[–—-]\s+|\s{2,}/)[0].trim();
  if (!txId || !number) return { error: "Rechnungsnummer eingeben oder aus der Liste wählen." };

  const allocRaw = String(formData.get("alloc_amount") ?? "").trim().replace(",", ".");
  const allocInput = allocRaw ? Number(allocRaw) : null;

  const supabase = await createClient();
  const { data: tx, error: te } = await supabase
    .from("bank_transaction")
    .select("id, amount")
    .eq("id", txId)
    .single();
  if (te || !tx) return { error: "Umsatz nicht gefunden." };

  // bereits zugeordneter Betrag dieser Buchung
  const { data: existing } = await supabase
    .from("bank_transaction_match")
    .select("amount")
    .eq("bank_transaction_id", txId);
  const allocated = r2((existing ?? []).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0));
  const remaining = r2(Math.abs(tx.amount) - allocated);
  if (remaining <= 0.005) return { error: "Buchung ist bereits vollständig zugeordnet." };

  if (side === "kreditor") {
    const { data: doc, error: de } = await supabase
      .from("incoming_document")
      .select("id, gross_amount")
      .eq("doc_number", number)
      .in("doc_type", ["invoice", "credit_note"])
      .limit(1)
      .maybeSingle();
    if (de) return { error: de.message };
    if (!doc) return { error: `Keine Eingangsrechnung mit Nummer ${number}.` };
    const want =
      allocInput && allocInput > 0 ? allocInput : Math.max(doc.gross_amount ?? remaining, 0) || remaining;
    const amt = r2(Math.min(remaining, want));
    const { error: me } = await supabase.from("bank_transaction_match").insert({
      bank_transaction_id: txId,
      incoming_document_id: doc.id,
      amount: amt,
      auto: false,
    });
    if (me) return { error: me.code === "23505" ? "Diese Eingangsrechnung ist schon zugeordnet." : me.message };
  } else {
    const { data: inv, error: ie } = await supabase
      .from("sales_invoice")
      .select("id, open_amount")
      .eq("invoice_number", number)
      .eq("kind", "invoice")
      .maybeSingle();
    if (ie) return { error: ie.message };
    if (!inv) return { error: `Keine Rechnung mit Nummer ${number}.` };
    const want =
      allocInput && allocInput > 0 ? allocInput : Math.max(inv.open_amount ?? remaining, 0) || remaining;
    const amt = r2(Math.min(remaining, want));
    const { error: me } = await supabase.from("bank_transaction_match").insert({
      bank_transaction_id: txId,
      sales_invoice_id: inv.id,
      amount: amt,
      auto: false,
    });
    if (me) return { error: me.code === "23505" ? "Diese Rechnung ist schon zugeordnet." : me.message };
  }

  // Status: voll oder teilweise zugeordnet?
  const { data: after } = await supabase
    .from("bank_transaction_match")
    .select("amount")
    .eq("bank_transaction_id", txId);
  const nowAllocated = r2((after ?? []).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0));
  await supabase
    .from("bank_transaction")
    .update({
      match_status: nowAllocated + 0.005 >= Math.abs(tx.amount) ? "matched" : "partial",
    })
    .eq("id", txId);

  revalidateAll();
  return { ok: true };
}

const SONDER_KINDS = ["skonto", "doppelzahlung", "sonstige"] as const;

/** Verbleibenden, noch nicht zugeordneten Betrag einer Buchung ermitteln. */
async function remainingAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  txId: string,
): Promise<{ tx: { id: string; amount: number }; remaining: number } | { error: string }> {
  const { data: tx, error: te } = await supabase
    .from("bank_transaction")
    .select("id, amount")
    .eq("id", txId)
    .single();
  if (te || !tx) return { error: "Umsatz nicht gefunden." };
  const { data: existing } = await supabase
    .from("bank_transaction_match")
    .select("amount")
    .eq("bank_transaction_id", txId);
  const allocated = r2((existing ?? []).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0));
  const remaining = r2(Math.abs(tx.amount) - allocated);
  return { tx, remaining };
}

/** match_status nach einer Änderung der Zuordnungen neu ableiten. */
async function refreshMatchStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  txId: string,
  amount: number,
) {
  const { data: after } = await supabase
    .from("bank_transaction_match")
    .select("amount")
    .eq("bank_transaction_id", txId);
  const nowAllocated = r2((after ?? []).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0));
  await supabase
    .from("bank_transaction")
    .update({ match_status: nowAllocated + 0.005 >= Math.abs(amount) ? "matched" : "partial" })
    .eq("id", txId);
}

/** Sonderbuchung ohne Beleg (Skonto, Doppelzahlung, Sonstiges) verbuchen. */
export async function matchSpecial(_prev: MatchState, formData: FormData): Promise<MatchState> {
  const txId = String(formData.get("tx_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!txId) return { error: "Umsatz fehlt." };
  if (!SONDER_KINDS.includes(kind as (typeof SONDER_KINDS)[number])) return { error: "Art wählen." };

  const supabase = await createClient();
  const r = await remainingAmount(supabase, txId);
  if ("error" in r) return r;
  if (r.remaining <= 0.005) return { error: "Buchung ist bereits vollständig zugeordnet." };

  const allocRaw = String(formData.get("alloc_amount") ?? "").trim().replace(",", ".");
  const allocInput = allocRaw ? Number(allocRaw) : null;
  const amt = r2(Math.min(r.remaining, allocInput && allocInput > 0 ? allocInput : r.remaining));

  const { error: me } = await supabase
    .from("bank_transaction_match")
    .insert({ bank_transaction_id: txId, kind, note, amount: amt, auto: false });
  if (me) return { error: me.message };

  await refreshMatchStatus(supabase, txId, r.tx.amount);
  revalidateAll();
  return { ok: true };
}

export type UploadState = { ok?: boolean; error?: string; docId?: string };

/**
 * Beleg direkt aus der Bank-Detailansicht hochladen: legt eine minimale
 * incoming_document-Zeile an (source: "upload", Vorbelegung aus der
 * Buchung), verknüpft sie sofort mit dem Umsatz und verweist zur
 * vollständigen Bearbeitung auf die bestehende Eingangsrechnungs-Seite -
 * dort steckt schon die ganze Positions-/Kontierungs-Logik, die hier nicht
 * dupliziert werden soll.
 */
export async function uploadBeleg(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const txId = String(formData.get("tx_id") ?? "");
  const file = formData.get("file") as File | null;
  if (!txId) return { error: "Umsatz fehlt." };
  if (!file || file.size === 0) return { error: "Datei wählen." };

  const supabase = await createClient();
  const { data: txFull, error: tfe } = await supabase
    .from("bank_transaction")
    .select("id, amount, counterparty_name, booking_date")
    .eq("id", txId)
    .single();
  if (tfe || !txFull) return { error: "Umsatz nicht gefunden." };

  const r = await remainingAmount(supabase, txId);
  if ("error" in r) return r;
  if (r.remaining <= 0.005) return { error: "Buchung ist bereits vollständig zugeordnet." };

  const allocRaw = String(formData.get("alloc_amount") ?? "").trim().replace(",", ".");
  const allocInput = allocRaw ? Number(allocRaw) : null;
  const amt = r2(Math.min(r.remaining, allocInput && allocInput > 0 ? allocInput : r.remaining));

  const bytes = Buffer.from(await file.arrayBuffer());
  const year = new Date(txFull.booking_date).getFullYear();
  const key = `eingangsrechnungen/${year}/upload-${randomUUID()}.pdf`;
  await putObject(key, bytes, file.type || "application/pdf");

  const { data: doc, error: de } = await supabase
    .from("incoming_document")
    .insert({
      source: "upload",
      doc_type: "invoice",
      file_name: file.name,
      pdf_storage_key: key,
      dedup_key: `upload:${randomUUID()}`,
      supplier_name: txFull.counterparty_name,
      gross_amount: amt,
      doc_date: txFull.booking_date,
    })
    .select("id")
    .single();
  if (de || !doc) {
    await deleteObject(key).catch(() => {});
    return { error: de?.message ?? "Beleg konnte nicht angelegt werden." };
  }

  const { error: me } = await supabase
    .from("bank_transaction_match")
    .insert({ bank_transaction_id: txId, incoming_document_id: doc.id, amount: amt, auto: false });
  if (me) return { error: me.message };

  await refreshMatchStatus(supabase, txId, txFull.amount);
  revalidateAll();
  revalidatePath("/eingangsrechnungen");
  return { ok: true, docId: doc.id };
}

export type SyncState = { ok?: boolean; error?: string; note?: string };

/**
 * Stößt einen FinTS-Bankabruf an. Läuft nicht sofort - die Web-App hat kein
 * FinTS/Python, das braucht der sync-Container. Legt nur eine Zeile in
 * sync_request an, ein Cron-Job dort (alle 2 min) holt sie ab.
 */
export async function requestBankSync(_prev: SyncState, _formData: FormData): Promise<SyncState> {
  const supabase = await createClient();

  const { data: offen } = await supabase
    .from("sync_request")
    .select("id")
    .eq("job", "fints:pull")
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();
  if (offen) return { error: "Es läuft schon eine Aktualisierung - bitte kurz warten." };

  const { error } = await supabase.from("sync_request").insert({ job: "fints:pull", params: {} });
  if (error) return { error: error.message };

  revalidatePath("/bank");
  return { ok: true, note: "Angefordert - wird in wenigen Minuten verarbeitet." };
}

export type RenameState = { ok?: boolean; error?: string };

/** Bankname pflegen - FinTS/CSV-Importe kennen (noch) keinen offiziellen
 *  Institutsnamen, das Feld bleibt sonst leer und die Avatare zeigen nur
 *  "KO" (aus dem generischen Label "Konto ..."). */
export async function renameBankAccount(
  _prev: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const id = String(formData.get("account_id") ?? "");
  const bankName = String(formData.get("bank_name") ?? "").trim();
  if (!id) return { error: "Konto fehlt." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_account")
    .update({ bank_name: bankName || null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/bank");
  return { ok: true };
}

export async function unmatchTransaction(formData: FormData): Promise<void> {
  const matchId = String(formData.get("match_id") ?? "");
  const txId = String(formData.get("tx_id") ?? "");
  if (!matchId) return;
  const supabase = await createClient();
  await supabase.from("bank_transaction_match").delete().eq("id", matchId);
  if (txId) {
    const { data: rest } = await supabase
      .from("bank_transaction_match")
      .select("amount")
      .eq("bank_transaction_id", txId);
    const { data: tx } = await supabase
      .from("bank_transaction")
      .select("amount")
      .eq("id", txId)
      .maybeSingle();
    const alloc = r2((rest ?? []).reduce((s, m) => s + Math.abs(m.amount ?? 0), 0));
    const status =
      alloc <= 0.005
        ? "unmatched"
        : tx && alloc + 0.005 >= Math.abs(tx.amount)
          ? "matched"
          : "partial";
    await supabase.from("bank_transaction").update({ match_status: status }).eq("id", txId);
  }
  revalidateAll();
}
