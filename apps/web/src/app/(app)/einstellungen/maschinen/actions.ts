"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

const TYPEN = ["druck", "cello", "binden", "konfektion", "sonstige"];

export async function saveMaschine(_prev: RowState, fd: FormData): Promise<RowState> {
  const id = (fd.get("id") as string) || null;
  const name = String(fd.get("name") ?? "").trim();
  const typ = String(fd.get("typ") ?? "").trim();
  const flux_printer_name = String(fd.get("flux_printer_name") ?? "").trim() || null;
  const farbe = String(fd.get("farbe") ?? "").trim() || null;
  const kapRaw = String(fd.get("kapazitaet_bogen_h") ?? "").trim();
  const kapazitaet_bogen_h = kapRaw ? Number(kapRaw) : null;
  const sortRaw = String(fd.get("sortierung") ?? "").trim();
  const sortierung = sortRaw ? Number(sortRaw) : 100;
  const aktiv = fd.get("aktiv") != null;

  const druckverfahren = String(fd.get("druckverfahren") ?? "").trim() || null;
  const farbenRaw = String(fd.get("max_farben") ?? "").trim();
  const max_farben = farbenRaw ? Number(farbenRaw) : null;
  const formate = String(fd.get("formate") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Rüstzustand: je Zeile „Papier | Format" (max. 9 Magazine).
  const geladen = String(fd.get("geladen") ?? "")
    .split("\n")
    .map((line) => {
      const [papier, format] = line.split("|").map((s) => s.trim());
      return { papier: papier || null, format: format || null };
    })
    .filter((g) => g.papier)
    .slice(0, 9);

  if (!name) return { error: "Name ist Pflicht." };
  if (!TYPEN.includes(typ)) return { error: "Typ ungültig." };
  if (kapazitaet_bogen_h != null && !Number.isFinite(kapazitaet_bogen_h))
    return { error: "Kapazität muss eine Zahl sein." };
  if (druckverfahren && !["digital", "offset"].includes(druckverfahren))
    return { error: "Druckverfahren ungültig." };
  if (max_farben != null && !Number.isFinite(max_farben))
    return { error: "Farben muss eine Zahl sein." };

  const supabase = await createClient();
  const payload = {
    name,
    typ,
    flux_printer_name,
    farbe,
    kapazitaet_bogen_h,
    sortierung,
    aktiv,
    druckverfahren,
    max_farben,
    formate,
    geladen,
  };
  const { error } = id
    ? await supabase.from("maschine").update(payload).eq("id", id)
    : await supabase.from("maschine").insert(payload);

  if (error) {
    if (error.code === "23505") return { error: `Maschine „${name}" existiert bereits.` };
    return { error: error.message };
  }
  revalidatePath("/einstellungen/maschinen");
  revalidatePath("/druck/plan");
  return { ok: true };
}

/** Fähigkeits-Werte einer Maschine speichern (Upsert bzw. Löschen bei leer). */
export async function setMaschineFaehigkeiten(_prev: RowState, fd: FormData): Promise<RowState> {
  const maschineId = String(fd.get("maschine_id") ?? "");
  if (!maschineId) return { error: "maschine_id fehlt" };

  let keys: { key: string; art: string }[] = [];
  try {
    keys = JSON.parse(String(fd.get("keys") ?? "[]"));
  } catch {
    return { error: "keys ungültig" };
  }

  const supabase = await createClient();
  const upserts: { maschine_id: string; faehigkeit_key: string; wert: unknown }[] = [];
  const deletes: string[] = [];

  for (const { key, art } of keys) {
    const feld = `f_${key}`;
    if (art === "flag") {
      upserts.push({ maschine_id: maschineId, faehigkeit_key: key, wert: fd.get(feld) != null });
    } else if (art === "max" || art === "min") {
      const raw = String(fd.get(feld) ?? "").trim();
      if (raw === "" || !Number.isFinite(Number(raw))) deletes.push(key);
      else upserts.push({ maschine_id: maschineId, faehigkeit_key: key, wert: Number(raw) });
    } else if (art === "liste") {
      const vals = fd
        .getAll(feld)
        .flatMap((v) => String(v).split(","))
        .map((s) => s.trim())
        .filter(Boolean);
      if (!vals.length) deletes.push(key);
      else upserts.push({ maschine_id: maschineId, faehigkeit_key: key, wert: vals });
    } else {
      const raw = String(fd.get(feld) ?? "").trim();
      if (!raw) deletes.push(key);
      else upserts.push({ maschine_id: maschineId, faehigkeit_key: key, wert: raw });
    }
  }

  if (deletes.length) {
    const { error } = await supabase
      .from("maschine_faehigkeit")
      .delete()
      .eq("maschine_id", maschineId)
      .in("faehigkeit_key", deletes);
    if (error) return { error: error.message };
  }
  if (upserts.length) {
    const { error } = await supabase
      .from("maschine_faehigkeit")
      .upsert(upserts, { onConflict: "maschine_id,faehigkeit_key" });
    if (error) return { error: error.message };
  }

  revalidatePath("/einstellungen/maschinen");
  revalidatePath("/druck/plan");
  return { ok: true };
}
