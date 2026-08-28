import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole =
  | "admin"
  | "office"
  | "accounting"
  | "production"
  | "shipping"
  | "employee"
  | "customer"
  | "supplier";

const STAFF_ROLES: AppRole[] = [
  "admin",
  "office",
  "accounting",
  "production",
  "shipping",
  "employee",
];

/** Aktuellen Auth-Benutzer holen oder auf /login umleiten. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/** Rollen des aktuellen Benutzers (RLS: user_role liefert nur die eigenen Zeilen). */
export async function getRoles(): Promise<AppRole[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_role").select("role");
  return (data ?? []).map((r) => r.role as AppRole);
}

/** Interner Bereich: eingeloggt UND Mitarbeiterrolle. */
export async function requireStaff() {
  const user = await requireUser();
  const roles = await getRoles();
  if (!roles.some((r) => STAFF_ROLES.includes(r))) redirect("/kein-zugriff");
  return { user, roles };
}

export function hasRole(roles: AppRole[], ...wanted: AppRole[]) {
  return roles.some((r) => wanted.includes(r));
}
