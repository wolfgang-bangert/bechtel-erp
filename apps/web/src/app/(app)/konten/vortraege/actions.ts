"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getModuleLevels } from "@/lib/auth";

export type State = { ok?: boolean; error?: string };

async function darf(): Promise<string | null> {
  const l = await getModuleLevels();
  return l.admin || l.buchhaltung === "edit" ? null : "Dafür fehlt das Recht „Buchhaltung bearbeiten“.";
}

/** Vortrag anlegen/ändern: Betrag positiv eingeben, Seite S/H wählen. */
export async function vortragSpeichern(_p: State, fd: FormData): Promise<State> {
  const nein = await darf();
  if (nein) return { error: nein };
  const jahr = Number(fd.get("jahr"));
  const konto = String(fd.get("konto") ?? "").trim();
  const raw = String(fd.get("betrag") ?? "").trim();
  const betrag = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  const seite = String(fd.get("seite") ?? "H");
  const notiz = String(fd.get("notiz") ?? "").trim() || null;
  if (!/^\d{4}$/.test(String(jahr))) return { error: "Jahr fehlt." };
  if (!/^\d{3,9}$/.test(konto)) return { error: "Kontonummer ungültig." };
  if (!Number.isFinite(betrag)) return { error: "Betrag ungültig." };
  const saldo = Math.round(Math.abs(betrag) * 100) / 100 * (seite === "S" ? 1 : -1);
  const sb = await createClient();
  const { error } = await sb.from("konto_vortrag").upsert({ jahr, konto, saldo, notiz }, { onConflict: "jahr,konto" });
  if (error) return { error: error.message };
  revalidatePath("/konten", "layout");
  revalidatePath("/lohnbuchungen/uebersicht");
  return { ok: true };
}

export async function vortragLoeschen(fd: FormData): Promise<void> {
  if (await darf()) return;
  const id = String(fd.get("id") ?? "");
  const sb = await createClient();
  await sb.from("konto_vortrag").delete().eq("id", id);
  revalidatePath("/konten", "layout");
  revalidatePath("/lohnbuchungen/uebersicht");
}
