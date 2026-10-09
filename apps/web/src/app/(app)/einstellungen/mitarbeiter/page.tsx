import { createClient } from "@/lib/supabase/server";
import { getModuleLevels, getRoles, hasRole } from "@/lib/auth";
import type { ModuleKey, ModuleLevel } from "@/lib/modules";
import { EinladenForm, MitarbeiterZeile, NachtragenForm, type Mitarbeiter } from "./ui";

export const dynamic = "force-dynamic";

export default async function MitarbeiterPage() {
  const roles = await getRoles();
  if (!hasRole(roles, "admin")) {
    return (
      <>
        <h1>Mitarbeiter</h1>
        <p className="lead">Nur für Admins.</p>
      </>
    );
  }

  const darfPersonal = !!(await getModuleLevels()).personal;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_user")
    .select("id, display_name, email, is_active, rollen:user_role(role), rechte:user_module_access(module, level)")
    .eq("kind", "employee")
    .order("display_name");
  const mitarbeiter: Mitarbeiter[] = (
    (data ?? []) as unknown as {
      id: string;
      display_name: string | null;
      email: string | null;
      is_active: boolean;
      rollen: { role: string }[];
      rechte: { module: ModuleKey; level: ModuleLevel }[];
    }[]
  ).map((u) => ({
    id: u.id,
    display_name: u.display_name,
    email: u.email,
    is_active: u.is_active,
    isAdmin: u.rollen.some((r) => r.role === "admin"),
    module: Object.fromEntries(u.rechte.map((r) => [r.module, r.level])),
  }));

  return (
    <>
      <h1>Mitarbeiter</h1>
      <p className="lead">
        Neue Kollegen einladen (verschickt eine E-Mail mit Link zum Passwort-Setzen) und pro Modul festlegen,
        was sie dürfen: <strong>kein Zugriff</strong> (Bereich ist unsichtbar und gesperrt), <strong>ansehen</strong>{" "}
        (nur lesen, Speichern und Ändern sind gesperrt) oder <strong>bearbeiten</strong>. Admins haben alles außer
        Personal – das sieht nur, wer es ausdrücklich freigegeben bekommt. Die Zeiterfassung hat jeder Mitarbeiter.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="rows">
        {mitarbeiter.map((m) => (
          <MitarbeiterZeile key={m.id} m={m} darfPersonal={darfPersonal} />
        ))}
        <EinladenForm darfPersonal={darfPersonal} />
      </div>
      <NachtragenForm darfPersonal={darfPersonal} />
    </>
  );
}
