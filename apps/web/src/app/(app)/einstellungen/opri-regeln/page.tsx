import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpriRegelnPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opri_material_regel")
    .select(
      "id, name, ebene, modus, material_rolle, verwendung, herkunft, prio, is_active, " +
        "gruppe:gruppe_id(kuerzel), stammartikel:stammartikel_id(sku), option_match",
    )
    .order("ebene")
    .order("prio");

  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    ebene: string;
    modus: string;
    material_rolle: string | null;
    verwendung: string | null;
    herkunft: string | null;
    prio: number;
    is_active: boolean;
    gruppe: { kuerzel: string } | null;
    stammartikel: { sku: string } | null;
    option_match: string | null;
  }[];

  return (
    <>
      <h1>onlineprinters — Materialregeln</h1>
      <p className="lead">
        Regeln je Ebene (Produktgruppe → Stammartikel → Option). Der Resolver
        sammelt alle passenden, spezifischere Ebene kann eine Rolle ersetzen/entfernen.
      </p>

      <div className="toolbar">
        <Link className="ghost" href="/einstellungen/opri-regeln/neu" style={{ padding: "7px 12px" }}>
          + Neue Regel
        </Link>
        <span className="count">{rows.length} Regeln</span>
      </div>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Ebene</th>
              <th>Ziel</th>
              <th>Modus</th>
              <th>Rolle / Verwendung</th>
              <th>Herkunft</th>
              <th>Prio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                <td>
                  <Link href={`/einstellungen/opri-regeln/${r.id}`}>{r.name}</Link>
                </td>
                <td>{r.ebene}</td>
                <td className="count">
                  {r.gruppe?.kuerzel ?? r.stammartikel?.sku ?? r.option_match ?? "—"}
                </td>
                <td>{r.modus}</td>
                <td>
                  {r.material_rolle ?? "—"}
                  {r.verwendung ? ` · ${r.verwendung}` : ""}
                </td>
                <td className="count">{r.herkunft ?? "—"}</td>
                <td>{r.prio}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>Noch keine Regeln.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
