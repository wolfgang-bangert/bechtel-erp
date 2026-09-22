import { createClient } from "@/lib/supabase/server";
import { getRoles, hasRole } from "@/lib/auth";
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_user")
    .select("id, display_name, email, is_active, rollen:user_role(id, role)")
    .eq("kind", "employee")
    .order("display_name");
  const mitarbeiter = (data ?? []) as unknown as Mitarbeiter[];

  return (
    <>
      <h1>Mitarbeiter</h1>
      <p className="lead">
        Neue Kollegen einladen (verschickt eine E-Mail mit Link zum Passwort-Setzen), Rollen vergeben, Zugriff
        entziehen.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="rows">
        <div className="row head">
          <span className="w-name">Name</span>
          <span style={{ width: 220 }}>E-Mail</span>
          <span>Rollen</span>
        </div>
        {mitarbeiter.map((m) => (
          <MitarbeiterZeile key={m.id} m={m} />
        ))}
        <EinladenForm />
      </div>
      <NachtragenForm />
    </>
  );
}
