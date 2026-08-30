"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { ok?: boolean; error?: string };

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

export async function saveIncoming(
  _prev: SaveState,
  fd: FormData,
): Promise<SaveState> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "keine ID" };
  const supabase = await createClient();
  const { error } = await supabase
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
      due_date: s(fd, "due_date"),
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
  if (error) return { error: error.message };
  revalidatePath(`/eingangsrechnungen/${id}`);
  return { ok: true };
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
