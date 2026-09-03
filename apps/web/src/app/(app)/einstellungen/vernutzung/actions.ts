"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { berechneNutzen } from "@/lib/nutzen";

export type State = { ok?: boolean; error?: string; note?: string };

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

export async function saveVernutzung(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  const format_id = s(fd, "format_id");
  const druckbogen_id = s(fd, "druckbogen_id");
  if (!format_id || !druckbogen_id) return { error: "Format und Druckbogen wählen." };
  const nutzen = Math.max(0, Math.round(num(fd, "nutzen") ?? 1));
  const payload = {
    format_id,
    druckbogen_id,
    nutzen,
    anordnung: s(fd, "anordnung"),
    gedreht: fd.get("gedreht") != null,
    randzugabe_mm: num(fd, "randzugabe_mm") ?? 4,
    ist_standard: fd.get("ist_standard") != null,
    quelle: "manuell" as const,
    notiz: s(fd, "notiz"),
  };
  const supabase = await createClient();

  if (payload.ist_standard) {
    await supabase
      .from("vernutzung")
      .update({ ist_standard: false })
      .eq("format_id", format_id)
      .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  }

  const { error } = id
    ? await supabase.from("vernutzung").update(payload).eq("id", id)
    : await supabase.from("vernutzung").upsert(payload, { onConflict: "format_id,druckbogen_id" });
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/vernutzung");
  return { ok: true };
}

export async function deleteVernutzung(_p: State, fd: FormData): Promise<State> {
  const id = s(fd, "id");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("vernutzung").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/vernutzung");
  return { ok: true };
}

/** Für jede aktive Format×Bogen-Kombi den Nutzen berechnen. Manuelle Zeilen bleiben. */
export async function generateVorschlaege(_p: State, fd: FormData): Promise<State> {
  const rand = num(fd, "randzugabe_mm") ?? 4;
  const supabase = await createClient();
  const [{ data: formate }, { data: boegen }, { data: vorhanden }] = await Promise.all([
    supabase.from("format").select("id, breite_mm, hoehe_mm").eq("is_active", true),
    supabase.from("druckbogen").select("id, breite_mm, hoehe_mm, greifer_mm").eq("is_active", true),
    supabase.from("vernutzung").select("format_id, druckbogen_id, quelle"),
  ]);
  const manuell = new Set(
    (vorhanden ?? [])
      .filter((v) => v.quelle === "manuell")
      .map((v) => `${v.format_id}|${v.druckbogen_id}`),
  );

  const rows: Record<string, unknown>[] = [];
  for (const f of formate ?? []) {
    for (const b of boegen ?? []) {
      if (manuell.has(`${f.id}|${b.id}`)) continue;
      const r = berechneNutzen(f, b as { breite_mm: number; hoehe_mm: number; greifer_mm: number }, rand);
      if (r.nutzen < 1) continue;
      rows.push({
        format_id: f.id,
        druckbogen_id: b.id,
        nutzen: r.nutzen,
        anordnung: r.anordnung,
        gedreht: r.gedreht,
        randzugabe_mm: rand,
        quelle: "berechnet",
      });
    }
  }
  if (!rows.length) return { ok: true, note: "nichts zu berechnen (Maße fehlen?)" };
  const { error } = await supabase
    .from("vernutzung")
    .upsert(rows, { onConflict: "format_id,druckbogen_id" });
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/vernutzung");
  return { ok: true, note: `${rows.length} Vorschläge erzeugt/aktualisiert` };
}
