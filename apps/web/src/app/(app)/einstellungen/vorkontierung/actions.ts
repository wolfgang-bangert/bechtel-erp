"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};

/** Vorkontierung = Standardkonten/Zahlart direkt an der Organisation. */
export async function saveRegel(_p: State, fd: FormData): Promise<State> {
  const organizationId = s(fd, "organization_id");
  const expenseAccount = s(fd, "expense_account");
  const revenueAccount = s(fd, "revenue_account");
  const paymentMethod = s(fd, "payment_method");
  const foreignKind = s(fd, "foreign_supply_kind");
  const gutschriftverfahren = fd.get("gutschriftverfahren") === "on";
  if (!organizationId) return { error: "Organisation ist Pflicht." };
  if (!expenseAccount && !revenueAccount && !paymentMethod && !foreignKind && !gutschriftverfahren) {
    return { error: "Aufwandskonto, Erlöskonto, Zahlart, Auslandslieferung oder Gutschriftverfahren angeben." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization")
    .update({
      default_expense_account: expenseAccount,
      default_revenue_account: revenueAccount,
      default_payment_method: paymentMethod,
      foreign_supply_kind: foreignKind === "service" || foreignKind === "goods" ? foreignKind : null,
      gutschriftverfahren,
      vorkontierung_source: "manual",
      vorkontierung_confidence: null,
    })
    .eq("id", organizationId);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/vorkontierung");
  revalidatePath(`/organisationen/${organizationId}`);
  redirect("/einstellungen/vorkontierung");
}

/** Entfernt die Vorkontierung der Organisation (alle drei Felder leer). */
export async function deleteRegel(_p: State, fd: FormData): Promise<State> {
  const organizationId = s(fd, "organization_id");
  if (!organizationId) return { error: "Organisation fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization")
    .update({
      default_expense_account: null,
      default_revenue_account: null,
      default_payment_method: null,
      foreign_supply_kind: null,
      gutschriftverfahren: false,
      vorkontierung_source: null,
      vorkontierung_confidence: null,
    })
    .eq("id", organizationId);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/vorkontierung");
  revalidatePath(`/organisationen/${organizationId}`);
  redirect("/einstellungen/vorkontierung");
}
