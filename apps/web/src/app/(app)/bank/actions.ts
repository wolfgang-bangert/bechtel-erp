"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { putObject, deleteObject } from "@/lib/storage";
import { verteileSammelzahlungMitSkonto } from "@werk/shared/bank/sammelSkonto";

export type MatchState = { ok?: boolean; error?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

type MatchRow = {
  amount: number | null;
  ledger_account: string | null;
  sales_invoice_id: string | null;
  incoming_document_id: string | null;
};

/** Summe der Match-Beträge, die tatsächlich Bankguthaben dieses Umsatzes
 *  binden. Eine Skonto-Buchungszeile (ledger_account + Beleg-Link auf
 *  derselben Zeile, siehe skontoApply) ist kein zusätzliches Bargeld -
 *  sie schließt die Rechnung nur über den schon vorhandenen vollen
 *  Zahlungs-Match hinweg und darf hier nicht mitgezählt werden, sonst
 *  erscheint der Umsatz um genau den Skontobetrag überallokiert. */
function sumCashMatches(rows: MatchRow[]): number {
  return r2(
    rows
      .filter((m) => !(m.ledger_account && (m.sales_invoice_id || m.incoming_document_id)))
      .reduce((s, m) => s + Math.abs(m.amount ?? 0), 0),
  );
}

/** Sammelzahlung mit Skonto: hängen an dieser Bankzeile mehrere
 *  Eingangsrechnungen und entspricht die Differenz (Summe offen − Bankbetrag)
 *  einem einheitlichen Skontosatz, werden die Zahlungs-Matches anteilig
 *  verteilt (offen × (1 − Satz)) statt nacheinander aufgefüllt - sonst bliebe
 *  der ganze Skonto an der letzten Rechnung hängen und skonto:apply erkennt
 *  ihn dort nicht. Den Rest je Rechnung bucht skonto:apply als Skonto aus.
 *  Greift nur, wenn die Bankzeile ausschließlich Eingangsrechnungen bezahlt
 *  und noch keine Skonto-/Sachkontozeilen hat. */
async function verteileSammelSkonto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  txId: string,
  txAmount: number,
) {
  const { data: rows } = await supabase
    .from("bank_transaction_match")
    .select("id, amount, ledger_account, kind, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const matches = rows ?? [];
  if (matches.length < 2) return;
  if (matches.some((m) => m.ledger_account || m.kind || m.sales_invoice_id || !m.incoming_document_id)) return;
  const docIds = matches.map((m) => m.incoming_document_id as string);
  if (new Set(docIds).size !== docIds.length) return;
  const { data: docs } = await supabase
    .from("incoming_document")
    .select("id, doc_type, open_amount, discount_percent, discount_amount")
    .in("id", docIds);
  if ((docs ?? []).length !== docIds.length || docs!.some((d) => d.doc_type !== "invoice")) return;
  const docById = new Map(docs!.map((d) => [d.id, d]));
  // offen vor dieser Bankzeile = jetziger Rest + hier schon zugeordneter Betrag
  const anteile = verteileSammelzahlungMitSkonto(
    txAmount,
    matches.map((m) => {
      const d = docById.get(m.incoming_document_id as string)!;
      return {
        id: m.id,
        offen: r2((d.open_amount ?? 0) + Math.abs(m.amount ?? 0)),
        discount_percent: d.discount_percent,
        discount_amount: d.discount_amount,
      };
    }),
  );
  if (!anteile) return;
  for (const a of anteile) {
    const m = matches.find((x) => x.id === a.id)!;
    if (Math.abs(Math.abs(m.amount ?? 0) - a.betrag) <= 0.005) continue;
    await supabase
      .from("bank_transaction_match")
      .update({ amount: (m.amount ?? 0) < 0 ? -a.betrag : a.betrag })
      .eq("id", a.id);
  }
}

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
    .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const allocated = sumCashMatches(existing ?? []);
  const remaining = r2(Math.abs(tx.amount) - allocated);
  if (remaining <= 0.005) return { error: "Buchung ist bereits vollständig zugeordnet." };

  if (side === "kreditor") {
    const { data: doc, error: de } = await supabase
      .from("incoming_document")
      .select("id, gross_amount")
      .eq("doc_number", number)
      .in("doc_type", ["invoice", "credit_note"])
      .neq("status", "rejected") // verworfene Dubletten nie zuordnen
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
    await verteileSammelSkonto(supabase, txId, tx.amount);
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
    .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const nowAllocated = sumCashMatches(after ?? []);
  await supabase
    .from("bank_transaction")
    .update({
      match_status: nowAllocated + 0.005 >= Math.abs(tx.amount) ? "matched" : "partial",
    })
    .eq("id", txId);

  revalidateAll();
  return { ok: true };
}

/** Sachkonten, bei denen die USt aus dem an dieser Bankzeile bereits
 *  verknüpften Beleg abgeleitet wird (Skonto mindert Rechnung und USt im
 *  selben Verhältnis). */
const SKONTO_ACCOUNTS = new Set(["3736", "3731", "8736", "8731"]);

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
    .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const allocated = sumCashMatches(existing ?? []);
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
    .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
    .eq("bank_transaction_id", txId);
  const nowAllocated = sumCashMatches(after ?? []);
  await supabase
    .from("bank_transaction")
    .update({ match_status: nowAllocated + 0.005 >= Math.abs(amount) ? "matched" : "partial" })
    .eq("id", txId);
}

/** Aus einem an dieser Bankzeile bereits verknüpften Beleg (Rechnung/
 *  Eingangsrechnung) den effektiven Steuersatz ableiten (tax_total/net_total)
 *  - für die USt-Aufteilung einer Skonto-Buchungszeile. Bei mehreren/keinem
 *  Beleg wird das erste brauchbare Ergebnis genommen bzw. null (dann bleibt
 *  die Buchungszeile ohne USt-Aufteilung, Betrag als Ganzes gebucht). */
async function effectiveTaxRateForTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  txId: string,
): Promise<number | null> {
  const { data: matches } = await supabase
    .from("bank_transaction_match")
    .select(
      "sales_invoice:sales_invoice(net_total, tax_total), incoming_document:incoming_document(net_amount, tax_amount)",
    )
    .eq("bank_transaction_id", txId)
    .or("sales_invoice_id.not.is.null,incoming_document_id.not.is.null");
  for (const m of matches ?? []) {
    const inv = m.sales_invoice as unknown as { net_total: number | null; tax_total: number | null } | null;
    const inc = m.incoming_document as unknown as { net_amount: number | null; tax_amount: number | null } | null;
    const net = inv?.net_total ?? inc?.net_amount;
    const tax = inv?.tax_total ?? inc?.tax_amount;
    if (net && tax != null && net > 0) return Math.round((tax / net) * 10000) / 100;
  }
  return null;
}

/** Buchungszeile gegen ein Sachkonto (Skonto, Durchlaufende Posten, ...)
 *  oder - falls (noch) kein passendes Sachkonto existiert - als reine
 *  Notiz ohne Ziel. Optional mit angehängtem Beleg (kein voller
 *  Eingangsrechnungs-Datensatz, nur die Datei). */
export async function matchSpecial(_prev: MatchState, formData: FormData): Promise<MatchState> {
  const txId = String(formData.get("tx_id") ?? "");
  const ledgerAccount = String(formData.get("ledger_account") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const file = formData.get("file") as File | null;
  if (!txId) return { error: "Umsatz fehlt." };
  if (!ledgerAccount && !note) return { error: "Sachkonto wählen oder Notiz eingeben." };

  const supabase = await createClient();
  const r = await remainingAmount(supabase, txId);
  if ("error" in r) return r;
  if (r.remaining <= 0.005) return { error: "Buchung ist bereits vollständig zugeordnet." };

  const allocRaw = String(formData.get("alloc_amount") ?? "").trim().replace(",", ".");
  const allocInput = allocRaw ? Number(allocRaw) : null;
  const amt = r2(Math.min(r.remaining, allocInput && allocInput > 0 ? allocInput : r.remaining));

  let netAmount: number | null = null;
  let taxRate: number | null = null;
  let taxAmount: number | null = null;
  if (ledgerAccount && SKONTO_ACCOUNTS.has(ledgerAccount)) {
    const rate = await effectiveTaxRateForTransaction(supabase, txId);
    if (rate != null) {
      taxRate = rate;
      netAmount = r2(amt / (1 + rate / 100));
      taxAmount = r2(amt - netAmount);
    }
  }

  let attachmentKey: string | null = null;
  let attachmentName: string | null = null;
  if (file && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    attachmentKey = `bank/buchung/${txId}/${randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    await putObject(attachmentKey, bytes, file.type || "application/octet-stream");
    attachmentName = file.name;
  }

  // kind nur als freundliches Label für die Anzeige ableiten - kein
  // Einfluss auf die Konstellation, das Sachkonto ist das eigentliche Ziel.
  const kind = ledgerAccount === "1590" ? "doppelzahlung" : SKONTO_ACCOUNTS.has(ledgerAccount ?? "")
    ? "skonto"
    : ledgerAccount
      ? null
      : "sonstige";

  const { error: me } = await supabase.from("bank_transaction_match").insert({
    bank_transaction_id: txId,
    ledger_account: ledgerAccount,
    kind,
    note,
    amount: amt,
    net_amount: netAmount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    attachment_storage_key: attachmentKey,
    attachment_file_name: attachmentName,
    auto: false,
  });
  if (me) {
    if (attachmentKey) await deleteObject(attachmentKey).catch(() => {});
    return { error: me.message };
  }

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
  // angehängter Beleg einer Sachkonto-Buchungszeile hat sonst keine
  // Referenz mehr - verwaist beim Aufheben, also mit löschen.
  const { data: removed } = await supabase
    .from("bank_transaction_match")
    .select("attachment_storage_key")
    .eq("id", matchId)
    .maybeSingle();
  await supabase.from("bank_transaction_match").delete().eq("id", matchId);
  if (removed?.attachment_storage_key) await deleteObject(removed.attachment_storage_key).catch(() => {});
  if (txId) {
    const { data: rest } = await supabase
      .from("bank_transaction_match")
      .select("amount, ledger_account, sales_invoice_id, incoming_document_id")
      .eq("bank_transaction_id", txId);
    const { data: tx } = await supabase
      .from("bank_transaction")
      .select("amount")
      .eq("id", txId)
      .maybeSingle();
    const alloc = sumCashMatches(rest ?? []);
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

export type GroupMatchState = { ok?: boolean; error?: string };

/** Mehrere Eingangsrechnungen auf einmal gegen eine Bankzeile buchen - für
 *  Kreditkarten-/PayPal-Sammelabrechnungen: der Lieferant zahlt hier nicht
 *  einzeln, die Bankzeile ist die Summe mehrerer Kartenbelege. Jeder
 *  ausgewählte Beleg wird mit seinem eigenen offenen Betrag verknüpft - welche
 *  Belege zusammengehören, wählt der Nutzer. Ausnahme: Sammelzahlung mit
 *  einheitlichem Skonto, dann anteilig (siehe verteileSammelSkonto). */
export async function matchMultipleIncoming(
  _prev: GroupMatchState,
  formData: FormData,
): Promise<GroupMatchState> {
  const txId = String(formData.get("tx_id") ?? "");
  const docIds = formData.getAll("doc_ids").map(String).filter(Boolean);
  if (!txId) return { error: "Umsatz fehlt." };
  if (!docIds.length) return { error: "Mindestens einen Beleg auswählen." };

  const supabase = await createClient();
  const r = await remainingAmount(supabase, txId);
  if ("error" in r) return r;

  const { data: docs, error: de } = await supabase
    .from("incoming_document")
    .select("id, open_amount, gross_amount")
    .in("id", docIds);
  if (de) return { error: de.message };

  for (const doc of docs ?? []) {
    const amt = r2(doc.open_amount ?? doc.gross_amount ?? 0);
    const { error: me } = await supabase.from("bank_transaction_match").insert({
      bank_transaction_id: txId,
      incoming_document_id: doc.id,
      amount: amt,
      auto: false,
    });
    if (me && me.code !== "23505") return { error: me.message };
  }

  await verteileSammelSkonto(supabase, txId, r.tx.amount);
  await refreshMatchStatus(supabase, txId, r.tx.amount);
  revalidateAll();
  return { ok: true };
}

/** Buchungstext einer bereits verbuchten Zeile nachträglich ergänzen/
 *  korrigieren - z.B. den aus der BuchhaltungsButler-Historie übernommenen
 *  Vorschlag anpassen, wenn Details (Betreff, Zeitraum) nicht ganz passen. */
export async function updateMatchNote(_prev: GroupMatchState, formData: FormData): Promise<GroupMatchState> {
  const matchId = String(formData.get("match_id") ?? "");
  if (!matchId) return { error: "Buchung fehlt." };
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("bank_transaction_match").update({ note }).eq("id", matchId);
  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

/**
 * Bankzeile als "ignoriert" markieren (z. B. reine Info-Zeile der Bank mit 0,00 €, nichts zu buchen) bzw. wieder
 * aufnehmen. Nur Zeilen ohne Buchung; ignorierte Zeilen zählen nicht mehr als offen.
 */
export async function setzeIgnoriert(formData: FormData): Promise<void> {
  const txId = String(formData.get("tx_id") ?? "");
  const ignorieren = String(formData.get("ignorieren") ?? "") === "1";
  if (!/^[0-9a-f-]{36}$/i.test(txId)) return;
  const supabase = await createClient();
  const { count } = await supabase
    .from("bank_transaction_match")
    .select("id", { count: "exact", head: true })
    .eq("bank_transaction_id", txId);
  if (count) return; // gebuchte Zeilen bleiben unberührt
  await supabase.from("bank_transaction").update({ match_status: ignorieren ? "ignored" : "unmatched" }).eq("id", txId);
  revalidatePath("/bank");
}
