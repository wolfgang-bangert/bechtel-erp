"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ladeVorschlaege } from "@/lib/zahlungen/vorschlag";
import { erzeugePain001, sepaId, type SepaFormat } from "@werk/shared/zahlung/sepa";

export type State = { ok?: boolean; error?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const datumDe = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "");

/** Zahlungslauf aus der Auswahl erzeugen: IBAN/Name kommen immer aus der Datenbank, nie aus dem Formular. */
export async function zahlungslaufErzeugen(_p: State, fd: FormData): Promise<State> {
  const ausfuehrung = String(fd.get("ausfuehrung") ?? "");
  const kontoId = String(fd.get("konto") ?? "");
  const format = String(fd.get("format") ?? "pain.001.001.03") as SepaFormat;
  const bic = String(fd.get("bic") ?? "").trim();
  const ids = fd.getAll("sel").map(String);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ausfuehrung)) return { error: "Ausführungsdatum fehlt." };
  if (!kontoId) return { error: "Absenderkonto wählen." };
  if (!ids.length) return { error: "Keine Rechnung ausgewählt." };
  if (!["pain.001.001.03", "pain.001.001.09"].includes(format)) return { error: "Format ungültig." };

  const supabase = await createClient();
  const { data: konto } = await supabase.from("bank_account").select("id, iban, label").eq("id", kontoId).maybeSingle();
  if (!konto) return { error: "Absenderkonto nicht gefunden." };
  const { data: setting } = await supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle();
  const profile = (setting?.value ?? {}) as { legal_name?: string; name?: string };
  const absenderName = profile.legal_name || profile.name || "Bechtel Druck";

  const vorschlaege = await ladeVorschlaege(supabase, { ausfuehrung, auchUngebucht: true });
  const byId = new Map(vorschlaege.map((v) => [v.id, v]));
  const zahlungen: Parameters<typeof erzeugePain001>[0]["zahlungen"] = [];
  const items: Record<string, unknown>[] = [];

  for (const id of ids) {
    const v = byId.get(id);
    if (!v) return { error: "Eine ausgewählte Rechnung ist nicht mehr offen. Bitte Seite neu laden." };
    if (v.bereits_im_lauf) return { error: `${v.supplier_name} ${v.doc_number ?? ""} ist schon in einem Zahlungslauf.` };
    if (!v.iban || !v.iban_gueltig) return { error: `${v.supplier_name} ${v.doc_number ?? ""}: IBAN fehlt oder ist ungültig.` };
    const betrag = r2(Number(String(fd.get(`betrag_${id}`) ?? "").replace(",", ".")));
    if (!Number.isFinite(betrag) || betrag <= 0) return { error: `${v.supplier_name} ${v.doc_number ?? ""}: Betrag ungültig.` };
    if (betrag > v.offen + 0.005) return { error: `${v.supplier_name} ${v.doc_number ?? ""}: Betrag höher als der offene Betrag.` };
    const skonto = r2(Math.max(0, v.offen - betrag));
    const zweck =
      `Rechnung ${v.doc_number ?? ""}${v.doc_date ? ` vom ${datumDe(v.doc_date)}` : ""}` +
      (skonto > 0.004 && v.mit_skonto ? ` abzgl. Skonto ${skonto.toFixed(2).replace(".", ",")} EUR` : betrag < v.offen - 0.005 ? " Teilzahlung" : "");
    const e2e = sepaId(`${v.doc_number ?? "RE"}-${id.slice(0, 6)}`);
    zahlungen.push({ name: v.empfaenger, iban: v.iban, betrag, endToEndId: e2e, verwendungszweck: zweck });
    items.push({
      incoming_document_id: id,
      creditor_name: v.empfaenger,
      creditor_iban: v.iban,
      amount: betrag,
      skonto_amount: v.mit_skonto ? skonto : 0,
      remittance: zweck,
      end_to_end_id: e2e,
    });
  }

  const msgId = `WERK-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
  let xml: string;
  try {
    xml = erzeugePain001({ format, msgId, erstellt: new Date(), ausfuehrung, absender: { name: absenderName, iban: konto.iban, bic: bic || null }, zahlungen });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const summe = r2(zahlungen.reduce((a, z) => a + z.betrag, 0));
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: batch, error } = await supabase
    .from("payment_batch")
    .insert({
      msg_id: msgId,
      debtor_name: absenderName,
      debtor_iban: konto.iban,
      debtor_bic: bic || null,
      execution_date: ausfuehrung,
      format,
      item_count: zahlungen.length,
      total: summe,
      xml,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !batch) return { error: error?.message ?? "Zahlungslauf konnte nicht gespeichert werden." };
  const { error: iErr } = await supabase.from("payment_batch_item").insert(items.map((i) => ({ ...i, batch_id: batch.id })));
  if (iErr) {
    await supabase.from("payment_batch").delete().eq("id", batch.id);
    return { error: iErr.message };
  }

  revalidatePath("/zahlungen");
  redirect(`/zahlungen/${batch.id}`);
}

export async function laufStatusSetzen(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !["eingereicht", "verworfen"].includes(status)) return { error: "Angaben fehlen." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("payment_batch")
    .update({ status, submitted_at: status === "eingereicht" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/zahlungen/${id}`);
  revalidatePath("/zahlungen");
  return { ok: true };
}
