"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/origin";
import { getModuleLevels } from "@/lib/auth";
import { MODULES, type ModuleKey, type ModuleLevel } from "@/lib/modules";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RowState = { ok?: boolean; error?: string };

type Rechte = Partial<Record<ModuleKey, ModuleLevel>>;

/** Liest die Modul-Auswahl (m_<modul> = view|edit|leer) und den Admin-Haken aus dem Formular. */
function leseRechte(fd: FormData): { levels: Rechte; admin: boolean } {
  const levels: Rechte = {};
  for (const m of MODULES) {
    const v = String(fd.get(`m_${m.key}`) ?? "");
    if (v === "view" || v === "edit") levels[m.key] = v;
  }
  return { levels, admin: fd.get("admin") === "1" };
}

async function adminPruefen(): Promise<string | null> {
  const l = await getModuleLevels();
  return l.admin ? null : "Nur Admins dürfen Rechte vergeben.";
}

// Rollen, die aus den Modulrechten abgeleitet werden (die Datenbank-Rechte hängen noch an den Rollen).
const ABGELEITETE_ROLLEN = ["employee", "office", "production", "accounting", "shipping"] as const;

function gewuenschteRollen(levels: Rechte): Set<string> {
  const r = new Set<string>();
  if (Object.keys(levels).length) r.add("employee");
  if (levels.vertrieb === "edit") {
    r.add("office");
    r.add("production");
  }
  if (levels.onlineprinters === "edit") r.add("office");
  if (levels.buchhaltung === "edit") r.add("accounting");
  if (levels.versand === "edit") r.add("shipping");
  return r;
}

/** Schreibt Modulrechte + Admin-Haken und gleicht die abgeleiteten Rollen an. */
async function speichereRechte(sb: SupabaseClient, userId: string, levels: Rechte, admin: boolean): Promise<string | null> {
  const keys = MODULES.map((m) => m.key as string);
  const behalten = Object.keys(levels);
  const del = sb.from("user_module_access").delete().eq("user_id", userId);
  const { error: dErr } = behalten.length ? await del.not("module", "in", `(${behalten.join(",")})`) : await del;
  if (dErr) return dErr.message;
  const rows = keys.filter((k) => levels[k as ModuleKey]).map((k) => ({ user_id: userId, module: k, level: levels[k as ModuleKey] }));
  if (rows.length) {
    const { error } = await sb.from("user_module_access").upsert(rows, { onConflict: "user_id,module" });
    if (error) return error.message;
  }

  const { data: roles } = await sb.from("user_role").select("id, role").eq("user_id", userId);
  const hat = new Map((roles ?? []).map((r) => [r.role as string, r.id as string]));

  if (admin && !hat.has("admin")) {
    const { error } = await sb.from("user_role").insert({ user_id: userId, role: "admin" });
    if (error) return error.message;
  }
  if (!admin && hat.has("admin")) {
    const { error } = await sb.from("user_role").delete().eq("id", hat.get("admin"));
    if (error) return error.message;
  }
  if (!admin) {
    const soll = gewuenschteRollen(levels);
    for (const rolle of ABGELEITETE_ROLLEN) {
      if (soll.has(rolle) && !hat.has(rolle)) {
        const { error } = await sb.from("user_role").insert({ user_id: userId, role: rolle });
        if (error) return error.message;
      }
      if (!soll.has(rolle) && hat.has(rolle)) {
        const { error } = await sb.from("user_role").delete().eq("id", hat.get(rolle));
        if (error) return error.message;
      }
    }
  }
  return null;
}

export async function ladeEin(_prev: RowState, fd: FormData): Promise<RowState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  if (!email || !name) return { error: "E-Mail und Name sind Pflicht." };
  const nein = await adminPruefen();
  if (nein) return { error: nein };
  const { levels, admin } = leseRechte(fd);

  const adminClient = createAdminClient();
  const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback`,
  });
  if (inviteErr) return { error: `Einladung fehlgeschlagen: ${inviteErr.message}` };
  const userId = invited.user.id;

  const sb = await createClient();
  const { error: auErr } = await sb.from("app_user").insert({ id: userId, kind: "employee", display_name: name, email });
  if (auErr) {
    await adminClient.auth.admin.deleteUser(userId);
    return { error: `Konnte Mitarbeiter nicht anlegen: ${auErr.message}` };
  }
  const rErr = await speichereRechte(sb, userId, levels, admin);
  if (rErr) {
    await adminClient.auth.admin.deleteUser(userId); // löscht app_user und Rechte per on delete cascade mit
    return { error: `Konnte Rechte nicht setzen: ${rErr}` };
  }

  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}

/**
 * Für Konten, die schon vor diesem Einladen-Ablauf direkt im Supabase-
 * Dashboard angelegt wurden (auth.users existiert, aber keine app_user-Zeile) - ergänzt die
 * fehlenden Zeilen und die Rechte, verschickt keine neue Einladungsmail.
 */
export async function nachtragen(_prev: RowState, fd: FormData): Promise<RowState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  if (!email || !name) return { error: "E-Mail und Name sind Pflicht." };
  const nein = await adminPruefen();
  if (nein) return { error: nein };
  const { levels, admin } = leseRechte(fd);

  const adminClient = createAdminClient();
  let userId: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { error: error.message };
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      userId = found.id;
      break;
    }
    if (data.users.length < 200) break;
  }
  if (!userId) {
    return { error: `Kein Supabase-Konto mit "${email}" gefunden - zuerst über "Einladen" anlegen.` };
  }

  const sb = await createClient();
  const { error: auErr } = await sb
    .from("app_user")
    .upsert({ id: userId, kind: "employee", display_name: name, email }, { onConflict: "id" });
  if (auErr) return { error: auErr.message };
  const rErr = await speichereRechte(sb, userId, levels, admin);
  if (rErr) return { error: rErr };

  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}

/** Modulrechte (und Admin-Haken) eines bestehenden Mitarbeiters speichern. */
export async function setzeRechte(_prev: RowState, fd: FormData): Promise<RowState> {
  const userId = String(fd.get("user_id") ?? "");
  if (!userId) return { error: "id fehlt." };
  const nein = await adminPruefen();
  if (nein) return { error: nein };
  const { levels, admin } = leseRechte(fd);

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user?.id === userId && !admin) return { error: "Du kannst dir den Admin-Zugang nicht selbst entziehen." };

  const err = await speichereRechte(sb, userId, levels, admin);
  if (err) return { error: err };
  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}

/**
 * "Einladungsmail erneut senden" - ein erneuter admin.inviteUserByEmail()
 * schlägt für bereits registrierte Konten fehl ("already registered"); für
 * einen frischen Link (egal ob das Konto die erste Einladung noch nie
 * bestätigt oder sein Passwort einfach vergessen hat) ist resetPasswordForEmail
 * der richtige, dafür vorgesehene Weg - funktioniert für jedes bestehende Konto.
 */
export async function linkErneutSenden(_prev: RowState, fd: FormData): Promise<RowState> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { error: "E-Mail fehlt." };

  const sb = await createClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback`,
  });
  if (error) return { error: error.message };

  return { ok: true };
}

export async function zugriffUmschalten(_prev: RowState, fd: FormData): Promise<RowState> {
  const userId = String(fd.get("user_id") ?? "");
  const aktiv = fd.get("aktiv") === "1";
  if (!userId) return { error: "id fehlt." };
  const nein = await adminPruefen();
  if (nein) return { error: nein };

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user?.id === userId && !aktiv) return { error: "Du kannst dich nicht selbst deaktivieren." };
  const { error } = await sb.from("app_user").update({ is_active: aktiv }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}
