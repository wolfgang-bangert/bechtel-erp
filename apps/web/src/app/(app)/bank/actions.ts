"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
