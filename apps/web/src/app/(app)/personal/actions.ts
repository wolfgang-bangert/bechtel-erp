"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERSONAL_FELDER, formWert } from "@werk/shared/personal/felder";
import { createClient } from "@/lib/supabase/server";
import { getModuleLevels } from "@/lib/auth";
import { berlinZuIso } from "@/lib/zeit";

export type State = { ok?: boolean; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function darfBearbeiten(): Promise<string | null> {
  const l = await getModuleLevels();
  return l.personal === "edit" ? null : "Dafür fehlt das Recht „Personal bearbeiten“.";
}

/** Alle Felder einer Person speichern (Formular aus PERSONAL_FELDER) + Login-Verknüpfung + aktiv. */
export async function personSpeichern(_prev: State, fd: FormData): Promise<State> {
  const nein = await darfBearbeiten();
  if (nein) return { error: nein };
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Unbekannte Person." };
  const zeile: Record<string, unknown> = {};
  for (const f of PERSONAL_FELDER) {
    // nur Felder, die im Formular stehen; Checkboxen haben einen versteckten Marker da_<spalte>
    if (!fd.has(`f_${f.spalte}`) && !fd.has(`da_${f.spalte}`)) continue;
    zeile[f.spalte] = formWert(f, fd.has(`f_${f.spalte}`) ? String(fd.get(`f_${f.spalte}`)) : null);
  }
  if (!zeile.vorname && !zeile.nachname && fd.has("f_nachname")) return { error: "Vor- oder Nachname ist Pflicht." };
  zeile.aktiv = fd.get("aktiv") === "1";
  const login = String(fd.get("app_user_id") ?? "");
  zeile.app_user_id = UUID.test(login) ? login : null;

  const supabase = await createClient();
  const { error } = await supabase.from("personal").update(zeile).eq("id", id);
  if (error) {
    if (error.message.includes("personal_app_user_id_key")) return { error: "Dieser Login ist schon mit einer anderen Person verknüpft." };
    return { error: error.message };
  }
  revalidatePath("/personal");
  revalidatePath(`/personal/${id}`);
  return { ok: true };
}

export async function personAnlegen(_prev: State, fd: FormData): Promise<State> {
  const nein = await darfBearbeiten();
  if (nein) return { error: nein };
  const vorname = String(fd.get("vorname") ?? "").trim();
  const nachname = String(fd.get("nachname") ?? "").trim();
  if (!nachname) return { error: "Nachname ist Pflicht." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("personal").insert({ vorname: vorname || null, nachname }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/personal");
  redirect(`/personal/${data.id}`);
}

/** Zeiteintrag anlegen oder korrigieren (Eingabe in deutscher Ortszeit). */
export async function zeitSpeichern(_prev: State, fd: FormData): Promise<State> {
  const nein = await darfBearbeiten();
  if (nein) return { error: nein };
  const id = String(fd.get("id") ?? "");
  const personalId = String(fd.get("personal_id") ?? "");
  const beginn = berlinZuIso(String(fd.get("beginn") ?? ""));
  const endeRaw = String(fd.get("ende") ?? "");
  const ende = endeRaw ? berlinZuIso(endeRaw) : null;
  if (!beginn) return { error: "Beginn fehlt." };
  if (endeRaw && !ende) return { error: "Ende ist ungültig." };
  if (ende && ende <= beginn) return { error: "Ende muss nach dem Beginn liegen." };
  const notiz = String(fd.get("notiz") ?? "").trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const werte = { beginn, ende, notiz, geaendert_von: user?.id ?? null, ende_grund: ende ? "feierabend" : null };
  const { error } = UUID.test(id)
    ? await supabase.from("zeit_eintrag").update(werte).eq("id", id)
    : UUID.test(personalId)
      ? await supabase.from("zeit_eintrag").insert({ ...werte, personal_id: personalId, quelle: "manuell" })
      : { error: { message: "Person fehlt." } };
  if (error) {
    if (error.message.includes("zeit_eintrag_offen_uq")) return { error: "Die Person hat schon einen offenen Eintrag (ohne Ende)." };
    return { error: error.message };
  }
  revalidatePath("/personal/zeiten");
  return { ok: true };
}

export async function zeitLoeschen(fd: FormData): Promise<void> {
  if (await darfBearbeiten()) return;
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("zeit_eintrag").delete().eq("id", id);
  revalidatePath("/personal/zeiten");
}
