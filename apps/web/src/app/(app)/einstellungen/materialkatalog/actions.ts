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

/** Einen Attribut-Schlüssel am Material mergen (read-modify-write auf attribute-JSON). */
async function patchAttribute(
  id: string,
  key: string,
  value: string | number | null,
): Promise<State> {
  const supabase = await createClient();
  const { data: current, error: rErr } = await supabase
    .from("material")
    .select("attribute")
    .eq("id", id)
    .maybeSingle();
  if (rErr) return { error: rErr.message };
  const attribute = { ...((current?.attribute as Record<string, unknown>) ?? {}) };
  if (value == null || value === "") delete attribute[key];
  else attribute[key] = value;
  const { error } = await supabase.from("material").update({ attribute }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/materialkatalog");
  return { ok: true };
}

/** Dicke (mm) am Material pflegen — Basis für die Blockstärkenberechnung (Wire-O). */
export async function setDicke(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const raw = s(fd, "dicke_mm");
  const dicke = raw == null ? null : Number(raw.replace(",", "."));
  if (raw != null && !Number.isFinite(dicke)) return { error: "Dicke ist keine Zahl." };
  return patchAttribute(id, "dicke_mm", dicke);
}

/** Format am Material pflegen — Ziel für Regeln mit Herkunft „aus Format". */
export async function setFormat(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  return patchAttribute(id, "Format", s(fd, "format"));
}
