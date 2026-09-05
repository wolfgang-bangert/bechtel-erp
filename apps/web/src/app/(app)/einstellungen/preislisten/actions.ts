"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type State = { ok?: boolean; error?: string; note?: string };

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

/** Leere Preisliste anlegen. */
export async function neueListeAction(_p: State, fd: FormData): Promise<State> {
  const name = s(fd, "name");
  const gueltig_ab = s(fd, "gueltig_ab");
  if (!name || !gueltig_ab) return { error: "Name und Startdatum sind Pflicht." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preis_liste")
    .insert({
      name,
      lieferant: s(fd, "lieferant"),
      gueltig_ab,
      gueltig_bis: s(fd, "gueltig_bis"),
      notiz: s(fd, "notiz"),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/einstellungen/preislisten");
  redirect(`/einstellungen/preislisten/${data.id}`);
}

/** Bestehende Ausgabe als neue Ausgabe kopieren, Preise × Faktor. */
export async function kopiereListeAction(_p: State, fd: FormData): Promise<State> {
  const basisId = s(fd, "basis_id");
  const name = s(fd, "name");
  const gueltig_ab = s(fd, "gueltig_ab");
  const prozent = n(fd, "prozent") ?? 0;
  if (!basisId || !name || !gueltig_ab) return { error: "Basis, Name und Startdatum sind Pflicht." };
  const supabase = await createClient();

  const { data: neu, error: nErr } = await supabase
    .from("preis_liste")
    .insert({
      name,
      lieferant: s(fd, "lieferant"),
      gueltig_ab,
      gueltig_bis: s(fd, "gueltig_bis"),
      basis_liste_id: basisId,
      aufschlag_prozent: prozent,
    })
    .select("id")
    .single();
  if (nErr) return { error: nErr.message };

  const faktor = 1 + prozent / 100;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("preis")
      .select("*")
      .eq("liste_id", basisId)
      .order("id")
      .range(from, from + 999);
    if (error) return { error: error.message };
    if (!data?.length) break;
    const batch = data.map((p) => {
      const { id, created_at, updated_at, ...rest } = p as Record<string, unknown>;
      void id;
      void created_at;
      void updated_at;
      return { ...rest, liste_id: neu.id, preis_netto: Math.round(Number(p.preis_netto) * faktor * 10000) / 10000 };
    });
    const { error: iErr } = await supabase.from("preis").insert(batch);
    if (iErr) return { error: iErr.message };
    if (data.length < 1000) break;
  }
  revalidatePath("/einstellungen/preislisten");
  redirect(`/einstellungen/preislisten/${neu.id}`);
}

export async function updateListeAction(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("preis_liste")
    .update({
      name: s(fd, "name"),
      lieferant: s(fd, "lieferant"),
      gueltig_ab: s(fd, "gueltig_ab"),
      gueltig_bis: s(fd, "gueltig_bis"),
      is_active: fd.get("is_active") != null,
      notiz: s(fd, "notiz"),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/einstellungen/preislisten/${id}`);
  return { ok: true, note: "gespeichert" };
}

export async function setPreisAction(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const listeId = String(fd.get("liste_id") ?? "");
  const wert = n(fd, "preis_netto");
  if (!id || wert == null) return { error: "Preis ungültig" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("preis")
    .update({ preis_netto: Math.round(wert * 10000) / 10000 })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/einstellungen/preislisten/${listeId}`);
  return { ok: true };
}

export async function neuerPreisAction(_p: State, fd: FormData): Promise<State> {
  const listeId = String(fd.get("liste_id") ?? "");
  const kategorie = s(fd, "kategorie");
  const auflage = n(fd, "auflage");
  const preis_netto = n(fd, "preis_netto");
  if (!listeId || !kategorie || auflage == null || preis_netto == null)
    return { error: "Kategorie, Auflage und Preis sind Pflicht." };
  const supabase = await createClient();
  const { error } = await supabase.from("preis").insert({
    liste_id: listeId,
    kategorie,
    produktgruppe: s(fd, "produktgruppe"),
    format: s(fd, "format"),
    blatt: n(fd, "blatt"),
    sorte: s(fd, "sorte"),
    farbigkeit: s(fd, "farbigkeit"),
    spalten_key: s(fd, "spalten_key") ?? `${kategorie}-manuell`,
    auflage,
    preis_netto: Math.round(preis_netto * 10000) / 10000,
    notiz: s(fd, "notiz"),
  });
  if (error) return { error: error.message };
  revalidatePath(`/einstellungen/preislisten/${listeId}`);
  return { ok: true, note: "angelegt" };
}

export async function loeschePreisAction(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  const listeId = String(fd.get("liste_id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();
  const { error } = await supabase.from("preis").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/einstellungen/preislisten/${listeId}`);
  return { ok: true };
}
