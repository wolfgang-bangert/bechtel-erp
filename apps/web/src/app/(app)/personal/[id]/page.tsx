import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getModuleLevels } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { PersonForm, type Login } from "./PersonForm";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const levels = await getModuleLevels();

  const [{ data: person, error }, { data: nutzer }, { data: vergeben }, { data: dokumente }] = await Promise.all([
    supabase.from("personal").select("*").eq("id", id).maybeSingle(),
    supabase.from("app_user").select("id, display_name, email, is_active").eq("kind", "employee").order("display_name"),
    supabase.from("personal").select("id, app_user_id").not("app_user_id", "is", null),
    supabase
      .from("dokument")
      .select("id, kategorie, titel, dokument_datum, created_at")
      .eq("personal_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (error) return <div className="banner-err">Fehler: {error.message}</div>;
  if (!person) notFound();

  // Logins, die noch frei sind (oder schon dieser Person gehören)
  const belegt = new Set((vergeben ?? []).filter((p) => p.id !== id).map((p) => p.app_user_id));
  const logins: Login[] = (nutzer ?? [])
    .filter((u) => !belegt.has(u.id))
    .map((u) => ({ id: u.id, label: `${u.display_name ?? u.email}${u.is_active ? "" : " (gesperrt)"}` }));

  const name = [person.vorname, person.nachname].filter(Boolean).join(" ");
  return (
    <>
      <h1>{name || "Person"}</h1>
      <p className="lead">
        {[person.personalnummer && `Personalnummer ${person.personalnummer}`, person.position, person.abteilung]
          .filter(Boolean)
          .join(" · ")}
        {person.aktiv ? "" : " · ausgeschieden"} ·{" "}
        <Link href={`/personal/zeiten?person=${id}`}>Zeiten ansehen</Link>
      </p>

      <PersonForm person={person} logins={logins} darfBearbeiten={levels.personal === "edit"} />

      <h2>Dokumente</h2>
      {dokumente && dokumente.length ? (
        <table className="data">
          <tbody>
            {dokumente.map((d) => (
              <tr key={d.id}>
                <td className="count">{fmtDate(d.dokument_datum ?? d.created_at)}</td>
                <td className="wrap">
                  <a href={`/dokumente/${d.id}/pdf`} target="_blank" rel="noreferrer">
                    {d.titel}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="count">Noch keine Dokumente. Personal-Dokumente kommen über den Nextcloud-Ordner „Personal“.</p>
      )}
    </>
  );
}
