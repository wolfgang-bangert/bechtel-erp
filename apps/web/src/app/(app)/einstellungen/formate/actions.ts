"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};
const n = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
};

export async function saveFormat(_p: RowState, fd: FormData): Promise<RowState> {
  const id = s(fd, "id");
  const code = s(fd, "code");
  const name = s(fd, "name");
  if (!code || !name) return { error: "Code und Name sind Pflicht." };
  const payload = {
    code,
    name,
    breite_mm: n(fd, "breite_mm"),
    hoehe_mm: n(fd, "hoehe_mm"),
    kategorie: s(fd, "kategorie") ?? "din",
    is_active: fd.get("is_active") != null,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("format").update(payload).eq("id", id)
    : await supabase.from("format").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/formate");
  return { ok: true };
}

export async function deleteFormat(_p: RowState, fd: FormData): Promise<RowState> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("format").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/formate");
  return { ok: true };
}

export async function saveBogen(_p: RowState, fd: FormData): Promise<RowState> {
  const id = s(fd, "id");
  const code = s(fd, "code");
  const name = s(fd, "name");
  const breite = n(fd, "breite_mm");
  const hoehe = n(fd, "hoehe_mm");
  if (!code || !name || !breite || !hoehe) return { error: "Code, Name, Maße sind Pflicht." };
  const payload = {
    code,
    name,
    breite_mm: breite,
    hoehe_mm: hoehe,
    greifer_mm: n(fd, "greifer_mm") ?? 0,
    is_default: fd.get("is_default") != null,
    is_active: fd.get("is_active") != null,
  };
  const supabase = await createClient();
  if (payload.is_default) {
    await supabase.from("druckbogen").update({ is_default: false }).neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  }
  const { error } = id
    ? await supabase.from("druckbogen").update(payload).eq("id", id)
    : await supabase.from("druckbogen").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/formate");
  return { ok: true };
}

export async function deleteBogen(_p: RowState, fd: FormData): Promise<RowState> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("druckbogen").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/formate");
  return { ok: true };
}
