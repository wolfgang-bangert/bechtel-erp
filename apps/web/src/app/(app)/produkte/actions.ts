"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RowState = { ok?: boolean; error?: string };

/** Neue Sprachversion: Struktur (Teile + Kapitel) aus einer Vorlage kopieren, ohne Dateien. */
export async function kopiereProdukt(_prev: RowState, fd: FormData): Promise<RowState> {
  const vorlageId = String(fd.get("vorlage_id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const sprache = String(fd.get("sprache") ?? "").trim() || null;
  if (!vorlageId) return { error: "Vorlage fehlt." };
  if (!name) return { error: "Name ist Pflicht." };

  const sb = await createClient();
  const { data: quelle } = await sb.from("produkt").select("art, beschreibung").eq("id", vorlageId).maybeSingle();
  if (!quelle) return { error: "Vorlage nicht gefunden." };

  const { data: teile, error: e1 } = await sb.from("produktteil").select("*").eq("produkt_id", vorlageId);
  const { data: kapitel, error: e2 } = await sb.from("produkt_kapitel").select("*").eq("produkt_id", vorlageId);
  if (e1 || e2) return { error: (e1 ?? e2)!.message };

  const { data: neu, error: e3 } = await sb
    .from("produkt")
    .insert({ name, sprache, art: quelle.art, beschreibung: quelle.beschreibung })
    .select("id")
    .single();
  if (e3 || !neu) return { error: e3?.message ?? "Produkt konnte nicht angelegt werden." };

  const strip = (r: Record<string, unknown>) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = r;
    return rest;
  };
  const teilMap = new Map<string, string>();
  const kapMap = new Map<string, string>();

  // 1) Hauptregister-Teile (Ziel der Verweise), 2) Kapitel, 3) übrige Teile
  const hr = (teile ?? []).filter((t) => t.typ === "hauptregister");
  for (const t of hr) {
    const { data, error } = await sb
      .from("produktteil")
      .insert({ ...strip(t), produkt_id: neu.id, kapitel_id: null, hauptregister_teil_id: null })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Kopieren fehlgeschlagen." };
    teilMap.set(t.id, data.id);
  }
  for (const k of kapitel ?? []) {
    const { data, error } = await sb
      .from("produkt_kapitel")
      .insert({
        ...strip(k),
        produkt_id: neu.id,
        hauptregister_teil_id: k.hauptregister_teil_id ? (teilMap.get(k.hauptregister_teil_id) ?? null) : null,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Kopieren fehlgeschlagen." };
    kapMap.set(k.id, data.id);
  }
  const rest = (teile ?? []).filter((t) => t.typ !== "hauptregister");
  if (rest.length) {
    const { error } = await sb.from("produktteil").insert(
      rest.map((t) => ({
        ...strip(t),
        produkt_id: neu.id,
        kapitel_id: t.kapitel_id ? (kapMap.get(t.kapitel_id) ?? null) : null,
        hauptregister_teil_id: t.hauptregister_teil_id ? (teilMap.get(t.hauptregister_teil_id) ?? null) : null,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/produkte");
  return { ok: true };
}
