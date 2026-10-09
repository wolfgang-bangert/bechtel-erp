import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Personal · werk" };

type Search = { q?: string; alle?: string };

export default async function PersonalPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const alle = sp.alle === "1";
  const supabase = await createClient();

  let query = supabase
    .from("personal")
    .select("id, personalnummer, vorname, nachname, position, abteilung, eintritt, austritt, aktiv, app_user_id")
    .order("nachname")
    .order("vorname");
  if (!alle) query = query.eq("aktiv", true);
  if (q) {
    const m = `%${q.replace(/[\\%_,()]/g, " ")}%`;
    query = query.or(`vorname.ilike.${m},nachname.ilike.${m},abteilung.ilike.${m},position.ilike.${m}`);
  }
  const { data, error } = await query;

  return (
    <>
      <h1>Personal</h1>
      <p className="lead">
        Mitarbeiterinnen und Mitarbeiter (einmalig aus Ninox übernommen, gepflegt wird hier). Nur für Personal-Berechtigte
        sichtbar.
      </p>
      <form className="toolbar" method="get">
        <input name="q" defaultValue={q} placeholder="Name, Abteilung, Position…" style={{ minWidth: 240 }} />
        <label className="chk">
          <input type="checkbox" name="alle" value="1" defaultChecked={alle} /> auch ausgeschiedene
        </label>
        <button type="submit">Suchen</button>
        <span className="count">{(data ?? []).length} Personen</span>
        <span style={{ flex: 1 }} />
        <Link href="/personal/neu">+ Person anlegen</Link>
      </form>
      {error && <div className="banner-err">Fehler: {error.message}</div>}
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Name</th>
              <th>Position</th>
              <th>Abteilung</th>
              <th>Eintritt</th>
              <th>Login</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id} style={p.aktiv ? undefined : { opacity: 0.55 }}>
                <td>{p.personalnummer ?? "–"}</td>
                <td className="wrap">
                  <Link href={`/personal/${p.id}`}>{[p.nachname, p.vorname].filter(Boolean).join(", ")}</Link>
                  {!p.aktiv && <span className="count"> · ausgeschieden {fmtDate(p.austritt)}</span>}
                </td>
                <td className="wrap">{p.position ?? "–"}</td>
                <td>{p.abteilung ?? "–"}</td>
                <td>{fmtDate(p.eintritt)}</td>
                <td>{p.app_user_id ? "✓" : "–"}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Keine Personen{q ? " gefunden" : " – Import aus Ninox: pnpm --filter sync personal:import"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
