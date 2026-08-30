"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  allocations?: AllocIn[];
};

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
      payee_differs: fd.get("payee_differs") != null,
      payee_name: s(fd, "payee_name"),
      payee_iban: s(fd, "payee_iban"),
      payee_reason: s(fd, "payee_reason"),
      net_amount: n(fd, "net_amount"),
      tax_amount: n(fd, "tax_amount"),
      gross_amount: n(fd, "gross_amount"),
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
            .map((a) => a.order_number!.trim()),
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
        const soId = a.link_type === "sales_order" && orderNum ? orderMap.get(orderNum) ?? null : null;
        if (a.link_type === "sales_order" && orderNum && !soId) unresolved += 1;
        allocRows.push({
          incoming_document_item_id: itemId,
          link_type: a.link_type,
          sales_order_id: soId,
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

  revalidatePath(`/eingangsrechnungen/${id}`);
  return {
    ok: true,
    note: unresolved ? `${unresolved} Auftragsnummer(n) nicht gefunden` : undefined,
  };
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
