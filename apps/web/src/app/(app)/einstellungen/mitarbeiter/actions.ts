"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/origin";
import type { AppRole } from "@/lib/auth";

export type RowState = { ok?: boolean; error?: string };

export async function ladeEin(_prev: RowState, fd: FormData): Promise<RowState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const rolle = String(fd.get("rolle") ?? "") as AppRole;
  if (!email || !name) return { error: "E-Mail und Name sind Pflicht." };

  const admin = createAdminClient();
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback`,
  });
  if (inviteErr) return { error: `Einladung fehlgeschlagen: ${inviteErr.message}` };
  const userId = invited.user.id;

  const sb = await createClient();
  const { error: auErr } = await sb.from("app_user").insert({
    id: userId,
    kind: "employee",
    display_name: name,
    email,
  });
  if (auErr) {
    await admin.auth.admin.deleteUser(userId);
    return { error: `Konnte Mitarbeiter nicht anlegen: ${auErr.message}` };
  }

  const { error: urErr } = await sb.from("user_role").insert({ user_id: userId, role: rolle });
  if (urErr) {
    await admin.auth.admin.deleteUser(userId); // löscht app_user via on delete cascade mit
    return { error: `Konnte Rolle nicht setzen: ${urErr.message}` };
  }

  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}

/**
 * Für Konten, die schon vor diesem Einladen-Ablauf direkt im Supabase-
 * Dashboard angelegt wurden (auth.users existiert, aber keine app_user/
 * user_role-Zeile) - ergänzt nur die fehlenden Zeilen, verschickt keine neue
 * Einladungsmail. Sucht per E-Mail, da die Admin-API keine direkte
 * getUserByEmail-Funktion hat.
 */
export async function nachtragen(_prev: RowState, fd: FormData): Promise<RowState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const rolle = String(fd.get("rolle") ?? "") as AppRole;
  if (!email || !name) return { error: "E-Mail und Name sind Pflicht." };

  const admin = createAdminClient();
  let userId: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
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

  const { error: urErr } = await sb.from("user_role").insert({ user_id: userId, role: rolle });
  if (urErr && urErr.code !== "23505") return { error: urErr.message };

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

export async function rolleHinzufuegen(_prev: RowState, fd: FormData): Promise<RowState> {
  const userId = String(fd.get("user_id") ?? "");
  const rolle = String(fd.get("rolle") ?? "") as AppRole;
  if (!userId || !rolle) return { error: "Rolle fehlt." };

  const sb = await createClient();
  const { error } = await sb.from("user_role").insert({ user_id: userId, role: rolle });
  if (error) return { error: error.code === "23505" ? "Rolle ist schon gesetzt." : error.message };

  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}

export async function rolleEntfernen(_prev: RowState, fd: FormData): Promise<RowState> {
  const userRoleId = String(fd.get("user_role_id") ?? "");
  if (!userRoleId) return { error: "id fehlt." };

  const sb = await createClient();
  const { error } = await sb.from("user_role").delete().eq("id", userRoleId);
  if (error) return { error: error.message };

  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}

export async function zugriffUmschalten(_prev: RowState, fd: FormData): Promise<RowState> {
  const userId = String(fd.get("user_id") ?? "");
  const aktiv = fd.get("aktiv") === "1";
  if (!userId) return { error: "id fehlt." };

  const sb = await createClient();
  const { error } = await sb.from("app_user").update({ is_active: aktiv }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/einstellungen/mitarbeiter");
  return { ok: true };
}
