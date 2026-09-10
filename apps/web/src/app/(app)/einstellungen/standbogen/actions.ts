"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const AUSRICHTUNG = ["", "Hochformat", "Querformat"];

export async function saveStandbogen(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = String(fd.get("id") ?? "").trim();
  const bezeichnung = String(fd.get("bezeichnung") ?? "").trim();
  const format = String(fd.get("format") ?? "").trim();
  const ausrichtung = String(fd.get("ausrichtung") ?? "").trim();
  const flux_signature = String(fd.get("flux_signature") ?? "").trim();
  const druckbogen = String(fd.get("druckbogen") ?? "").trim() || null;
  const nutzenRaw = String(fd.get("nutzen") ?? "").trim();
  const nutzen = nutzenRaw ? Number(nutzenRaw) : null;
  const notiz = String(fd.get("notiz") ?? "").trim() || null;
  const aktiv = fd.get("aktiv") != null;
  const sortRaw = String(fd.get("sortierung") ?? "").trim();
  const sortierung = sortRaw ? Number(sortRaw) : 100;

  if (!format) return { error: "Format ist Pflicht." };
  if (!flux_signature) return { error: "flux-Signature ist Pflicht." };
  if (!AUSRICHTUNG.includes(ausrichtung)) return { error: "Ausrichtung ungültig." };
  if (nutzen != null && (!Number.isInteger(nutzen) || nutzen < 1))
    return { error: "Nutzen muss eine ganze Zahl ≥ 1 sein." };

  const payload = {
    bezeichnung: bezeichnung || `${format}${ausrichtung ? ` ${ausrichtung}` : ""}`,
    format,
    ausrichtung: ausrichtung || null,
    flux_signature,
    druckbogen,
    nutzen,
    notiz,
    aktiv,
    sortierung,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("standbogen").update(payload).eq("id", id)
    : await supabase.from("standbogen").insert(payload);

  if (error) {
    if (error.code === "23505")
      return { error: `Für „${format}${ausrichtung ? ` / ${ausrichtung}` : ""}" gibt es schon einen Standbogen.` };
    return { error: error.message };
  }
  revalidatePath("/einstellungen/standbogen");
  return { ok: true };
}

export async function deleteStandbogen(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "keine id" };
  const supabase = await createClient();
  const { error } = await supabase.from("standbogen").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/standbogen");
  return { ok: true };
}
