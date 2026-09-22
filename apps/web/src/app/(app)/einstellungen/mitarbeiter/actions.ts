"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/auth";

export type RowState = { ok?: boolean; error?: string };

async function origin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host")}`;
}

export async function ladeEin(_prev: RowState, fd: FormData): Promise<RowState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const rolle = String(fd.get("rolle") ?? "") as AppRole;
  if (!email || !name) return { error: "E-Mail und Name sind Pflicht." };

  const admin = createAdminClient();
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await origin()}/auth/callback`,
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
