"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buchungsProbleme, schluesselInfo } from "@/lib/belegPruefung";
import { putObject, signedGetUrl } from "@/lib/storage";

export type SaveState = { ok?: boolean; error?: string; note?: string };

const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const n = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
};

type AllocIn = {
  link_type: "sales_order" | "material" | "cost_center";
  order_number?: string;
  material_ref?: string;
  cost_center_id?: string;
  amount?: number | null;
  note?: string;
};
type PosIn = {
  position?: number | null;
  description?: string;
  quantity?: number | null;
  unit_price?: number | null;
  tax_rate?: number | null;
  net_amount?: number | null;
  ledger_account?: string;
  tax_code_id?: string;
  material_ref?: string;
  supplier_sku?: string;
  order_reference?: string;
  booking_text?: string;
  linked_document_id?: string;
  allocations?: AllocIn[];
};

// Keyline zeigt "W7-MN-2S", gespeichert ist "W7MN2S".
const normOrderNo = (x: string) => x.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const emptyToNull = (x: unknown) => {
  const v = typeof x === "string" ? x.trim() : x;
  return v === "" || v == null ? null : v;
};

export async function saveIncoming(
  _prev: SaveState,
  fd: FormData,
): Promise<SaveState> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "keine ID" };
  const supabase = await createClient();

  const { error: hErr } = await supabase
    .from("incoming_document")
    .update({
      doc_type: s(fd, "doc_type") ?? "invoice",
      supplier_organization_id: s(fd, "supplier_organization_id"),
      supplier_name: s(fd, "supplier_name"),
      supplier_vat_id: s(fd, "supplier_vat_id"),
      supplier_iban: s(fd, "supplier_iban"),
      doc_number: s(fd, "doc_number"),
      doc_date: s(fd, "doc_date"),
      service_date: s(fd, "service_date"),
      vat_period_date: s(fd, "vat_period_date"),
      due_date: s(fd, "net_due_date") ?? s(fd, "due_date"),
      net_due_date: s(fd, "net_due_date"),
      discount_date: s(fd, "discount_date"),
      discount_percent: n(fd, "discount_percent"),
      discount_amount: n(fd, "discount_amount"),
      payee_differs: fd.get("payee_differs") === "on",
      payee_name: s(fd, "payee_name"),
      payee_iban: s(fd, "payee_iban"),
      payee_reason: s(fd, "payee_reason"),
      currency: s(fd, "currency")?.toUpperCase().slice(0, 3) ?? "EUR",
      net_amount: n(fd, "net_amount"),
      tax_amount: n(fd, "tax_amount"),
      gross_amount: n(fd, "gross_amount"),
      fx_gross_amount: n(fd, "fx_gross_amount"),
      exchange_rate: n(fd, "exchange_rate"),
      payment_method: s(fd, "payment_method"),
      ledger_account: s(fd, "ledger_account"),
      tax_code_id: s(fd, "tax_code_id"),
      cost_center_id: s(fd, "cost_center_id"),
      payment_status: s(fd, "payment_status") ?? "open",
      notes: s(fd, "notes"),
    })
    .eq("id", id);
  if (hErr) return { error: hErr.message };

  // --- Positionen + Aufteilungen komplett ersetzen -------------------------
  let positions: PosIn[] = [];
  try {
    positions = JSON.parse(String(fd.get("positions_json") ?? "[]"));
  } catch {
    positions = [];
  }

  // Mit einem anderen Beleg verknüpfte Positionen (z. B. Kreditkartenzeile): Steuerschlüssel, Satz und Konto
  // kommen vom verknüpften Beleg - dort steht die tatsächliche Steuer (z. B. Reverse Charge §13b).
  const linkedIds = [...new Set(positions.map((p) => emptyToNull(p.linked_document_id)).filter((x): x is string => !!x))];
  if (linkedIds.length) {
    const { data: ld } = await supabase.from("incoming_document").select("id, tax_code_id, ledger_account").in("id", linkedIds);
    const codeIds = [...new Set((ld ?? []).map((d) => d.tax_code_id).filter((x): x is string => !!x))];
    const { data: codes } = codeIds.length ? await supabase.from("tax_code").select("id, rate, treatment").in("id", codeIds) : { data: [] };
    const codeBy = new Map((codes ?? []).map((c) => [c.id as string, c]));
    const docBy = new Map((ld ?? []).map((d) => [d.id as string, d]));
    positions = positions.map((p) => {
      const d = p.linked_document_id ? docBy.get(p.linked_document_id) : undefined;
      if (!d) return p;
      const c = d.tax_code_id ? codeBy.get(d.tax_code_id as string) : undefined;
      return {
        ...p,
        tax_code_id: (d.tax_code_id as string | null) ?? p.tax_code_id,
        ledger_account: (d.ledger_account as string | null) ?? p.ledger_account,
        tax_rate: c ? (c.treatment === "standard_de" && c.rate != null ? Number(c.rate) : 0) : p.tax_rate,
      };
    });
  }

  await supabase.from("incoming_document_item").delete().eq("incoming_document_id", id);

  let unresolved = 0;
  if (positions.length) {
    const { data: inserted, error: iErr } = await supabase
      .from("incoming_document_item")
      .insert(
        positions.map((p, k) => ({
          incoming_document_id: id,
          position: p.position ?? k + 1,
          description: emptyToNull(p.description),
          quantity: p.quantity ?? null,
          unit_price: p.unit_price ?? null,
          tax_rate: p.tax_rate ?? null,
          net_amount: p.net_amount ?? null,
          ledger_account: emptyToNull(p.ledger_account),
          tax_code_id: emptyToNull(p.tax_code_id),
          material_ref: emptyToNull(p.material_ref),
          supplier_sku: emptyToNull(p.supplier_sku),
          order_reference: emptyToNull(p.order_reference),
          booking_text: emptyToNull(typeof p.booking_text === "string" ? p.booking_text.slice(0, 60) : p.booking_text),
          linked_document_id: emptyToNull(p.linked_document_id),
        })),
      )
      .select("id");
    if (iErr) return { error: iErr.message };

    // Auftragsnummern → sales_order.id
    const wantedNumbers = Array.from(
      new Set(
        positions.flatMap((p) =>
          (p.allocations ?? [])
            .filter((a) => a.link_type === "sales_order" && a.order_number?.trim())
            .map((a) => normOrderNo(a.order_number!)),
        ),
      ),
    );
    const orderMap = new Map<string, string>();
    if (wantedNumbers.length) {
      const { data: orders } = await supabase
        .from("sales_order")
        .select("id, order_number")
        .in("order_number", wantedNumbers);
      for (const o of orders ?? []) if (o.order_number) orderMap.set(o.order_number, o.id);
    }

    const allocRows: Record<string, unknown>[] = [];
    positions.forEach((p, k) => {
      const itemId = inserted?.[k]?.id;
      if (!itemId) return;
      for (const a of p.allocations ?? []) {
        const orderNum = a.order_number?.trim() || null;
        const soId = a.link_type === "sales_order" && orderNum ? orderMap.get(normOrderNo(orderNum)) ?? null : null;
        if (a.link_type === "sales_order" && orderNum && !soId) unresolved += 1;
        allocRows.push({
          incoming_document_item_id: itemId,
          link_type: a.link_type,
          sales_order_id: soId,
          // Gelesene/eingetippte Referenz bleibt auch ohne passenden sales_order erhalten.
          order_ref: a.link_type === "sales_order" ? orderNum : null,
          material_ref:
            a.link_type === "material" ? emptyToNull(a.material_ref) : null,
          cost_center_id:
            a.link_type === "cost_center" ? emptyToNull(a.cost_center_id) : null,
          amount: a.amount ?? 0,
          note: emptyToNull(a.note),
        });
      }
    });
    if (allocRows.length) {
      const { error: aErr } = await supabase
        .from("incoming_document_allocation")
        .insert(allocRows);
      if (aErr) return { error: aErr.message };
    }
  }

  // Summen immer aus den Positionen neu berechnen (Netto, USt je Satz, Brutto, Skonto). Gutschrift (und Rechnung mit
  // negativem Gesamtbetrag): alle Beträge positiv - das Vorzeichen steckt im Belegtyp "Gutschrift".
  if (positions.length) {
    const r2n = (x: number) => Math.round(x * 100) / 100;
    let nets = positions.map((p) => Number(p.net_amount ?? 0));
    const rates = positions.map((p) => Number(p.tax_rate ?? 0));
    const sumOf = (ns: number[]) => {
      const g = new Map<number, number>();
      ns.forEach((n, i) => g.set(rates[i], (g.get(rates[i]) ?? 0) + n));
      const net = r2n([...g.values()].reduce((a, b) => a + b, 0));
      const taxBy: Record<string, number> = {};
      let tax = 0;
      for (const [rate, n] of g) {
        const t = r2n((n * rate) / 100);
        taxBy[String(rate)] = t;
        tax = r2n(tax + t);
      }
      return { net, tax, taxBy };
    };
    let sums = sumOf(nets);
    let docType = s(fd, "doc_type") ?? "invoice";
    if (sums.net + sums.tax < -0.004 && (docType === "credit_note" || docType === "invoice")) {
      nets = nets.map((x) => -x);
      sums = sumOf(nets);
      docType = "credit_note";
      // Positionen mit vertauschtem Vorzeichen ablegen
      const { data: its } = await supabase.from("incoming_document_item").select("id, net_amount").eq("incoming_document_id", id);
      for (const it of its ?? []) await supabase.from("incoming_document_item").update({ net_amount: -Number(it.net_amount ?? 0) }).eq("id", it.id);
    }
    const gross = r2n(sums.net + sums.tax);
    const pct = n(fd, "discount_percent");
    await supabase
      .from("incoming_document")
      .update({
        doc_type: docType,
        net_amount: sums.net,
        tax_amount: sums.tax,
        gross_amount: gross,
        tax_breakdown: sums.taxBy,
        ...(pct != null && pct > 0 ? { discount_amount: r2n((gross * pct) / 100) } : {}),
      })
      .eq("id", id);
  }

  // Hat der Nutzer jede Position selbst mit einem Steuerschlüssel versehen, gilt ein offener
  // USt-Vorschlag als erledigt.
  if (positions.length && positions.every((p) => emptyToNull(p.tax_code_id))) {
    const { data: cur } = await supabase.from("incoming_document").select("extraction").eq("id", id).maybeSingle();
    const ex = (cur?.extraction ?? null) as Record<string, unknown> | null;
    const u = ex?._ust as { status?: string } | undefined;
    if (ex && u?.status === "vorschlag") {
      await supabase
        .from("incoming_document")
        .update({ extraction: { ...ex, _ust: { ...u, status: "bestaetigt" } } })
        .eq("id", id);
    }
  }

  revalidatePath(`/eingangsrechnungen/${id}`);
  return {
    ok: true,
    note: unresolved ? `${unresolved} Auftragsreferenz(en) ohne passenden Auftrag - als Text gespeichert` : undefined,
  };
}

export type UploadIncomingState = {
  ok?: boolean;
  error?: string;
  count?: number;
  uploaded?: { file_name: string; url: string | null }[];
};

/**
 * Manueller Beleg-Upload - macht denselben ersten Schritt wie der Mailabruf
 * (mail:fetch): PDF ablegen + "captured"-Zeile anlegen, keine eigene
 * Extraktion hier (läuft nur im sync-Container). Stößt die KI-Extraktion
 * stattdessen über sync_request an (wie "Banken aktualisieren" auf /bank),
 * dort übernimmt incoming:extract auch die Erkennung/Aufteilung von
 * Sammel-PDFs mit mehreren Rechnungen (z.B. Amazon-Marktplatz-Sammelbeleg).
 * Ein Formular-Feld "file" kann mehrere Dateien enthalten (multiple).
 */
export async function uploadIncoming(
  _prev: UploadIncomingState,
  fd: FormData,
): Promise<UploadIncomingState> {
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Datei wählen." };

  const supabase = await createClient();
  let count = 0;
  const uploaded: { file_name: string; url: string | null }[] = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const dedupKey = `upload:${sha256}`;

    const { data: exists } = await supabase
      .from("incoming_document")
      .select("id")
      .eq("dedup_key", dedupKey)
      .maybeSingle();
    if (exists) continue; // identischer Beleg schon erfasst
    // dieselbe Datei aus anderem Kanal (Mail, BB-Import) zählt ebenfalls als schon erfasst
    const { data: sameFile } = await supabase.from("incoming_document").select("id").eq("file_sha256", sha256).limit(1);
    if (sameFile && sameFile.length) continue;

    const year = new Date().getFullYear();
    const key = `eingangsrechnungen/${year}/${randomUUID()}.pdf`;
    await putObject(key, bytes, file.type || "application/pdf");

    const { error } = await supabase.from("incoming_document").insert({
      source: "upload",
      file_name: file.name,
      pdf_storage_key: key,
      file_sha256: sha256,
      dedup_key: dedupKey,
    });
    if (error) return { error: error.message };
    count += 1;
    // Link zum Original-PDF, damit direkt nach dem Upload geprüft werden kann,
    // ob die richtige Datei erfasst wurde - unabhängig davon, ob die KI-
    // Extraktion (inkl. möglicher Sammel-PDF-Aufteilung) schon gelaufen ist.
    uploaded.push({ file_name: file.name, url: await signedGetUrl(key, 1800) });
  }

  if (count > 0) {
    await supabase.from("sync_request").insert({ job: "incoming:extract", params: {} });
  }
  revalidatePath("/eingangsrechnungen");
  return { ok: true, count, uploaded };
}

const BUCHUNG_SELECT =
  "id, doc_number, supplier_name, ledger_account, tax_code_id, net_amount, tax_amount, gross_amount, ust_status:extraction->_ust->>status, incoming_document_item!incoming_document_item_incoming_document_id_fkey ( ledger_account, tax_code_id, linked_document_id, net_amount, tax_rate )" as const;

/** Probleme je Beleg-ID (leer = buchbar). */
async function buchbarkeit(ids: string[]): Promise<Map<string, { label: string; probleme: string[] }>> {
  const supabase = await createClient();
  const [{ data }, { data: codes }] = await Promise.all([
    supabase.from("incoming_document").select(BUCHUNG_SELECT).in("id", ids),
    supabase.from("tax_code").select("id, code, rate, treatment"),
  ]);
  const schluessel = schluesselInfo(codes ?? []);
  const out = new Map<string, { label: string; probleme: string[] }>();
  for (const d of data ?? []) {
    out.set(d.id, {
      label: `${d.doc_number ?? d.id.slice(0, 8)} · ${d.supplier_name ?? "?"}`,
      probleme: buchungsProbleme({ ...d, items: d.incoming_document_item ?? [] }, { schluessel }),
    });
  }
  return out;
}

export async function setIncomingStatus(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !["extracted", "booked", "rejected"].includes(status)) return;
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "booked") {
    // Sperre: nur korrekt kontierte Belege mit stimmigen Summen buchen
    if ((await buchbarkeit([id])).get(id)?.probleme.length !== 0) return;
    patch.reviewed_at = new Date().toISOString();
  }
  await supabase.from("incoming_document").update(patch).eq("id", id);
  revalidatePath("/eingangsrechnungen");
  revalidatePath(`/eingangsrechnungen/${id}`);
}

/**
 * USt-Vorschlag bestätigen (ein Klick) bzw. mit anderem Schlüssel überschreiben:
 * setzt den Steuerschlüssel am Beleg und an allen Positionen (Standard-Schlüssel je
 * Positionssatz, Reverse Charge für alle) und markiert die Prüfung als bestätigt.
 */
export async function bestaetigeUst(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const codeId = String(fd.get("tax_code_id") ?? "");
  if (!id || !codeId) return;
  const supabase = await createClient();
  const { data: codes } = await supabase
    .from("tax_code")
    .select("id, rate, treatment")
    .eq("direction", "input")
    .eq("is_active", true);
  const chosen = (codes ?? []).find((c) => c.id === codeId);
  if (!chosen) return;
  const zeroCodeId =
    (codes ?? []).find((c) => c.treatment === "tax_free_other" && Number(c.rate) === 0)?.id ?? null;
  const stdByRate = (rate: number | null) =>
    rate == null
      ? null
      : ((codes ?? []).find((c) => c.treatment === "standard_de" && Math.round(Number(c.rate)) === Math.round(Number(rate)))
          ?.id ?? null);

  const { data: items } = await supabase
    .from("incoming_document_item")
    .select("id, tax_rate")
    .eq("incoming_document_id", id);
  for (const it of items ?? []) {
    // 0-%-Positionen (z.B. DPD-Europa) bekommen keinen Vorsteuer-Schlüssel
    const itemCode =
      chosen.treatment === "standard_de"
        ? it.tax_rate != null && Number(it.tax_rate) === 0
          ? zeroCodeId
          : (stdByRate(it.tax_rate) ?? chosen.id)
        : chosen.id;
    await supabase.from("incoming_document_item").update({ tax_code_id: itemCode }).eq("id", it.id);
  }
  const { data: doc } = await supabase
    .from("incoming_document")
    .select("extraction, status, ledger_account")
    .eq("id", id)
    .maybeSingle();
  const ex = (doc?.extraction ?? {}) as Record<string, unknown>;
  const ust = { ...((ex._ust as Record<string, unknown>) ?? {}), status: "bestaetigt", tax_code_id: chosen.id };
  const patch: Record<string, unknown> = { tax_code_id: chosen.id, extraction: { ...ex, _ust: ust } };
  // Bestätigen ersetzt das separate Speichern: ist der Beleg noch offen und jede Position hat ein Konto
  // (oder der Beleg eine Vorgabe), gilt er damit als geprüft.
  const { data: konten } = await supabase
    .from("incoming_document_item")
    .select("ledger_account, linked_document_id")
    .eq("incoming_document_id", id);
  const kontenOk = (konten ?? []).every((k) => k.linked_document_id || k.ledger_account || doc?.ledger_account);
  if (doc && ["captured", "extracted"].includes(doc.status) && kontenOk && ((konten ?? []).length > 0 || doc.ledger_account)) {
    patch.status = "booked";
    patch.reviewed_at = new Date().toISOString();
  }
  await supabase.from("incoming_document").update(patch).eq("id", id);
  revalidatePath(`/eingangsrechnungen/${id}`);
  revalidatePath("/eingangsrechnungen");
}

/**
 * Ein als "Sonstiges"/Mahnung eingestuftes Dokument ist doch eine Rechnung: zurück auf "erfasst" mit
 * force_invoice - die nächste Erkennung (stündlich) liest es als Rechnung ein und sortiert es nicht erneut
 * als Sonstiges ein.
 */
export async function alsRechnungBehandeln(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("incoming_document")
    .update({
      status: "captured",
      doc_type: "unknown",
      force_invoice: true,
      forwarded_at: null,
      notes: "Vom Nutzer als Rechnung eingestuft - wird beim nächsten Lauf als Rechnung eingelesen.",
    })
    .eq("id", id);
  revalidatePath(`/eingangsrechnungen/${id}`);
  revalidatePath("/eingangsrechnungen");
}

/**
 * Beleg von Hand als "Sonstiges" einstufen (kein Beleg, nicht buchungsrelevant, z.B. Lieferschein/AGB/Angebot).
 * Wird nicht weitergeleitet (forwarded_at gesetzt); Umkehr über "Als Rechnung behandeln".
 */
export async function alsSonstigesBehandeln(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("incoming_document")
    .update({
      status: "dunning",
      doc_type: "other",
      force_invoice: false,
      forwarded_at: new Date().toISOString(),
      notes: "Von Hand als Sonstiges eingestuft.",
    })
    .eq("id", id);
  revalidatePath(`/eingangsrechnungen/${id}`);
  revalidatePath("/eingangsrechnungen");
}

/**
 * Mehrere Belege auf einmal als gebucht markieren (Sichtprüfung in der Liste). Nur offene Rechnungen/Gutschriften,
 * und nur solche, die Konto, Steuerschlüssel und stimmige Summen haben - die übrigen werden mit Grund zurückgemeldet.
 */
export async function buchenMehrere(
  ids: string[],
): Promise<{ gebucht: number; abgelehnt: { label: string; probleme: string[] }[] }> {
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!clean.length) return { gebucht: 0, abgelehnt: [] };
  const check = await buchbarkeit(clean);
  const ok = clean.filter((id) => check.get(id)?.probleme.length === 0);
  const abgelehnt = clean.filter((id) => !ok.includes(id) && check.has(id)).map((id) => check.get(id)!);
  const supabase = await createClient();
  const { data } = ok.length
    ? await supabase
        .from("incoming_document")
        .update({ status: "booked", reviewed_at: new Date().toISOString() })
        .in("id", ok)
        .in("status", ["captured", "extracted"])
        .in("doc_type", ["invoice", "credit_note", "receipt"])
        .select("id")
    : { data: [] as { id: string }[] };
  revalidatePath("/eingangsrechnungen");
  return { gebucht: (data ?? []).length, abgelehnt };
}

/** Konto am Beleg und an allen Positionen setzen (Schnellbutton in der Liste). */
export async function setzeKontoAlle(id: string, konto: string): Promise<void> {
  const k = konto.trim();
  if (!id || !k) return;
  const supabase = await createClient();
  await supabase.from("incoming_document").update({ ledger_account: k }).eq("id", id);
  await supabase.from("incoming_document_item").update({ ledger_account: k }).eq("incoming_document_id", id).is("linked_document_id", null);
  revalidatePath("/eingangsrechnungen");
  revalidatePath(`/eingangsrechnungen/${id}`);
}

/** Vermerk "von Kollegen gesehen" (wer, wann) setzen bzw. zurücknehmen. */
export async function kollegenGesehen(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const gesehen = String(fd.get("gesehen") ?? "") === "1";
  if (!id) return;
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  await supabase
    .from("incoming_document")
    .update(
      gesehen
        ? { colleague_checked_at: new Date().toISOString(), colleague_checked_by: u.user?.id ?? null }
        : { colleague_checked_at: null, colleague_checked_by: null },
    )
    .eq("id", id);
  revalidatePath("/eingangsrechnungen");
  revalidatePath(`/eingangsrechnungen/${id}`);
}

/** Zahlart für mehrere Belege auf einmal setzen (Mehrfachauswahl in der Liste). */
export async function zahlartMehrere(ids: string[], method: string): Promise<{ gesetzt: number }> {
  if (!["card", "paypal", "transfer", "direct_debit"].includes(method)) return { gesetzt: 0 };
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!clean.length) return { gesetzt: 0 };
  const supabase = await createClient();
  const { data } = await supabase.from("incoming_document").update({ payment_method: method }).in("id", clean).select("id");
  revalidatePath("/eingangsrechnungen");
  return { gesetzt: (data ?? []).length };
}

/**
 * Eine Bankzeile am Eingangsbeleg zuordnen (Gegenstück zur Zuordnung auf der Bank-Seite). Verbucht höchstens den
 * noch freien Betrag der Bankzeile und höchstens den offenen Betrag des Belegs.
 */
export async function ordneBankzeileZu(docId: string, txId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(docId) || !/^[0-9a-f-]{36}$/i.test(txId)) return { error: "Ungültige Angabe." };
  const supabase = await createClient();
  const [{ data: doc }, { data: tx }, { data: tmatches }, { data: dmatches }] = await Promise.all([
    supabase.from("incoming_document").select("id, doc_type, status, gross_amount").eq("id", docId).maybeSingle(),
    supabase.from("bank_transaction").select("id, amount").eq("id", txId).maybeSingle(),
    supabase.from("bank_transaction_match").select("amount, ledger_account, sales_invoice_id, incoming_document_id").eq("bank_transaction_id", txId),
    supabase.from("bank_transaction_match").select("amount").eq("incoming_document_id", docId),
  ]);
  if (!doc || !tx) return { error: "Beleg oder Bankzeile nicht gefunden." };
  if (!["invoice", "credit_note"].includes(doc.doc_type) || doc.status === "rejected")
    return { error: "Nur offene Rechnungen/Gutschriften können zugeordnet werden." };
  if (doc.doc_type === "invoice" && tx.amount >= 0) return { error: "Eine Rechnung wird mit einem Abgang (Soll) bezahlt." };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const belegt = r2(
    (tmatches ?? []).filter((m) => !(m.ledger_account && (m.sales_invoice_id || m.incoming_document_id))).reduce((a, m) => a + Math.abs(m.amount ?? 0), 0),
  );
  const frei = r2(Math.abs(tx.amount) - belegt);
  if (frei <= 0.005) return { error: "Die Bankzeile ist schon vollständig zugeordnet." };
  const bezahlt = r2((dmatches ?? []).reduce((a, m) => a + Math.abs(m.amount ?? 0), 0));
  const offen = r2(Math.abs(Number(doc.gross_amount ?? 0)) - bezahlt);
  if (offen <= 0.005) return { error: "Der Beleg ist schon vollständig bezahlt." };

  const amt = r2(Math.min(frei, offen));
  const { error } = await supabase.from("bank_transaction_match").insert({
    bank_transaction_id: txId,
    incoming_document_id: docId,
    amount: doc.doc_type === "credit_note" ? amt : -amt,
    auto: false,
  });
  if (error) return { error: error.code === "23505" ? "Diese Zuordnung gibt es schon." : error.message };
  await supabase
    .from("bank_transaction")
    .update({ match_status: belegt + amt + 0.005 >= Math.abs(tx.amount) ? "matched" : "partial" })
    .eq("id", txId);
  revalidatePath(`/eingangsrechnungen/${docId}`);
  revalidatePath("/eingangsrechnungen");
  revalidatePath("/bank");
  return { ok: true };
}
