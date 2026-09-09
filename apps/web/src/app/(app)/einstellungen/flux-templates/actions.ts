"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};
const json = (fd: FormData, k: string): { value: Record<string, unknown> } | { error: string } => {
  const raw = s(fd, k);
  if (!raw) return { value: {} };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return { value: v as Record<string, unknown> };
    return { error: `${k}: JSON-Objekt erwartet` };
  } catch {
    return { error: `${k}: ungültiges JSON` };
  }
};

export async function saveTemplate(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const name = s(fd, "name");
  const flux_product = s(fd, "flux_product");
  if (!name || !flux_product) return { error: "Name und flux-Produkt sind Pflicht." };

  const svc = json(fd, "services");
  if ("error" in svc) return { error: svc.error };
  const extra = json(fd, "extra");
  if ("error" in extra) return { error: extra.error };

  const payload = {
    name,
    flux_product,
    flux_product_id: s(fd, "flux_product_id"),
    signature: s(fd, "signature"),
    paper_type: s(fd, "paper_type"),
    paper_type_back: s(fd, "paper_type_back"),
    services: svc.value,
    extra: extra.value,
    is_active: fd.get("is_active") != null,
    notiz: s(fd, "notiz"),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("flux_template").update(payload).eq("id", id)
    : await supabase.from("flux_template").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/flux-templates");
  redirect("/einstellungen/flux-templates");
}

export async function deleteTemplate(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("flux_template").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/flux-templates");
  redirect("/einstellungen/flux-templates");
}
