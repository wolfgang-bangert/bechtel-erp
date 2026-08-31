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
  const side = String(formData.get("side") ?? "debitor"); // debitor = Kundenzahlung, kreditor = Lieferantenzahlung
  const number =
    String(formData.get("invoice_number") ?? "").trim() ||
    String(formData.get("invoice_number_manual") ?? "").trim();
  if (!txId || !number) return { error: "Rechnung auswählen oder Nummer eingeben." };

  const supabase = await createClient();
  const { data: tx, error: te } = await supabase
    .from("bank_transaction")
    .select("id, amount")
    .eq("id", txId)
    .single();
  if (te || !tx) return { error: "Umsatz nicht gefunden." };

  if (side === "kreditor") {
    const { data: doc, error: de } = await supabase
      .from("incoming_document")
      .select("id, gross_amount, doc_number")
      .eq("doc_number", number)
      .in("doc_type", ["invoice", "credit_note"])
      .limit(1)
      .maybeSingle();
    if (de) return { error: de.message };
    if (!doc) return { error: `Keine Eingangsrechnung mit Nummer ${number}.` };

    const { error: me } = await supabase.from("bank_transaction_match").insert({
      bank_transaction_id: txId,
      incoming_document_id: doc.id,
      amount: r2(Math.abs(tx.amount)),
      auto: false,
    });
    if (me) return { error: me.code === "23505" ? "Bereits zugeordnet." : me.message };
  } else {
    const { data: inv, error: ie } = await supabase
      .from("sales_invoice")
      .select("id, open_amount, invoice_number")
      .eq("invoice_number", number)
      .eq("kind", "invoice")
      .maybeSingle();
    if (ie) return { error: ie.message };
    if (!inv) return { error: `Keine Rechnung mit Nummer ${number}.` };

    const amount =
      r2(Math.min(Math.abs(tx.amount), Math.max(inv.open_amount ?? 0, 0))) ||
      r2(Math.abs(tx.amount));
    const { error: me } = await supabase.from("bank_transaction_match").insert({
      bank_transaction_id: txId,
      sales_invoice_id: inv.id,
      amount,
      auto: false,
    });
    if (me) return { error: me.code === "23505" ? "Bereits zugeordnet." : me.message };
  }

  await supabase.from("bank_transaction").update({ match_status: "matched" }).eq("id", txId);
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
    const { count } = await supabase
      .from("bank_transaction_match")
      .select("id", { count: "exact", head: true })
      .eq("bank_transaction_id", txId);
    await supabase
      .from("bank_transaction")
      .update({ match_status: (count ?? 0) > 0 ? "partial" : "unmatched" })
      .eq("id", txId);
  }
  revalidateAll();
}
