"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string };

const s = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  return t === "" ? null : t;
};
const num = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
};

export async function saveWireODurchmesser(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const teilung = s(fd, "teilung");
  const durchmesser_zoll = s(fd, "durchmesser_zoll");
  const durchmesser_mm = num(fd, "durchmesser_mm");
  const blockstaerke_min = num(fd, "blockstaerke_min");
  const blockstaerke_max = num(fd, "blockstaerke_max");
  if (!teilung || (teilung !== "3:1" && teilung !== "2:1")) return { error: "Teilung wählen (3:1 oder 2:1)." };
  if (blockstaerke_min == null || blockstaerke_max == null)
    return { error: "Blockstärke von/bis angeben." };
  if (blockstaerke_min > blockstaerke_max) return { error: "Blockstärke von darf nicht größer als bis sein." };

  const payload = {
    teilung,
    durchmesser_zoll,
    durchmesser_mm,
    blockstaerke_min,
    blockstaerke_max,
    bezeichnung: s(fd, "bezeichnung"),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("wire_o_durchmesser").update(payload).eq("id", id)
    : await supabase.from("wire_o_durchmesser").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/wire-o-durchmesser");
  return { ok: true };
}

export async function deleteWireODurchmesser(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("wire_o_durchmesser").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/wire-o-durchmesser");
  return { ok: true };
}
