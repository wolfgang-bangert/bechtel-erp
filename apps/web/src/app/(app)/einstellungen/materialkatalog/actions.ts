"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};
const numOrNull = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function createMaterial(_p: State, fd: FormData): Promise<State> {
  const name = s(fd, "name");
  if (!name) return { error: "Name ist Pflicht." };

  const attribute: Record<string, unknown> = {};
  const grammatur = numOrNull(fd, "grammatur");
  if (grammatur != null) attribute.Grammatur_g = grammatur;
  const sorte = s(fd, "sorte");
  if (sorte) attribute.Sorte = sorte;
  const oberflaeche = s(fd, "oberflaeche");
  if (oberflaeche) attribute["Oberfläche"] = oberflaeche;
  const dicke = numOrNull(fd, "dicke_mm");
  if (dicke != null) attribute.dicke_mm = dicke;

  const supabase = await createClient();
  const { error } = await supabase.from("material").insert({
    name,
    name_kurz: s(fd, "name_kurz"),
    rolle_id: s(fd, "rolle_id"),
    attribute,
    flux_paper_type: s(fd, "flux_paper_type"),
    is_active: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/materialkatalog");
  return { ok: true };
}

export async function setFluxPaperType(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("flux_paper_type") ?? "").trim();
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("material")
    .update({ flux_paper_type: raw === "" ? null : raw })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/materialkatalog");
  return { ok: true };
}
