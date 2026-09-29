"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};

export async function saveRegel(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const organizationId = s(fd, "organization_id");
  const expenseAccount = s(fd, "expense_account");
  const revenueAccount = s(fd, "revenue_account");
  if (!organizationId) return { error: "Organisation ist Pflicht." };
  if (!expenseAccount && !revenueAccount) {
    return { error: "Aufwandskonto oder Erlöskonto angeben." };
  }

  const payload = {
    organization_id: organizationId,
    expense_account: expenseAccount,
    revenue_account: revenueAccount,
    note: s(fd, "note"),
    is_active: fd.get("is_active") != null,
    source: "manual",
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("posting_rule").update(payload).eq("id", id)
    : await supabase.from("posting_rule").insert(payload);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Für diese Organisation existiert schon eine Regel - dort bearbeiten statt neu anlegen."
          : error.message,
    };
  }
  revalidatePath("/einstellungen/vorkontierung");
  redirect("/einstellungen/vorkontierung");
}

export async function deleteRegel(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("posting_rule").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/vorkontierung");
  redirect("/einstellungen/vorkontierung");
}
