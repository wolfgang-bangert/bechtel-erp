"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function saveRegel(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const counterpartyName = s(fd, "counterparty_name");
  const ledgerAccount = s(fd, "ledger_account");
  if (!counterpartyName || !ledgerAccount) return { error: "Gegenseite und Sachkonto sind Pflicht." };

  const payload = {
    counterparty_key: normalize(counterpartyName),
    counterparty_name: counterpartyName,
    ledger_account: ledgerAccount,
    sample_postingtext: s(fd, "sample_postingtext"),
    is_active: fd.get("is_active") != null,
    source: "manual",
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("bank_ledger_rule").update(payload).eq("id", id)
    : await supabase.from("bank_ledger_rule").insert(payload);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? `Für "${counterpartyName}" existiert schon eine Regel.`
          : error.message,
    };
  }
  revalidatePath("/einstellungen/bank-regeln");
  redirect("/einstellungen/bank-regeln");
}

export async function deleteRegel(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("bank_ledger_rule").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/bank-regeln");
  redirect("/einstellungen/bank-regeln");
}
