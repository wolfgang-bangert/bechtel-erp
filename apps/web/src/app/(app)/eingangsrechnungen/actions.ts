"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function setIncomingStatus(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !["extracted", "reviewed", "booked", "rejected"].includes(status)) return;
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "reviewed") patch.reviewed_at = new Date().toISOString();
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
    patch.status = "reviewed";
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
