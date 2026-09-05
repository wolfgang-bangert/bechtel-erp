import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NeueListe } from "./NeueListe";

export const dynamic = "force-dynamic";

export default async function PreislistenPage() {
  const supabase = await createClient();
  const { data: listen } = await supabase
    .from("preis_liste")
    .select("id, name, lieferant, gueltig_ab, gueltig_bis, aufschlag_prozent, is_active, preise:preis(count)")
    .order("gueltig_ab", { ascending: false });
  const rows = (listen ?? []) as unknown as {
    id: string;
    name: string;
    lieferant: string | null;
    gueltig_ab: string;
    gueltig_bis: string | null;
    aufschlag_prozent: number;
    is_active: boolean;
    preise: { count: number }[];
  }[];

  return (
    <>
      <h1>Preislisten</h1>
      <p className="lead">
        Zeitraum-gültige Ausgaben. Auswahl je Auftrag über das <strong>Versanddatum</strong>
        (Fallback Lieferdatum). Alle Preise liegen in der Datenbank (Tabellen{" "}
        <code>preis_liste</code> + <code>preis</code>) — auf eine Ausgabe klicken, um sie zu sehen
        und zu bearbeiten.
      </p>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Herkunft</th>
              <th>gültig ab</th>
              <th>gültig bis</th>
              <th style={{ textAlign: "right" }}>Aufschlag</th>
              <th style={{ textAlign: "right" }}>Preise</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                <td>
                  <Link href={`/einstellungen/preislisten/${r.id}`}>{r.name}</Link>
                </td>
                <td className="count">{r.lieferant ?? "—"}</td>
                <td className="count">{r.gueltig_ab}</td>
                <td className="count">{r.gueltig_bis ?? "unbefristet"}</td>
                <td style={{ textAlign: "right" }} className="count">
                  {Number(r.aufschlag_prozent) ? `+${Number(r.aufschlag_prozent)} %` : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{r.preise?.[0]?.count ?? 0}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>Noch keine Preisliste.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 22 }}>Neue Ausgabe</h2>
      <NeueListe basen={rows.map((r) => ({ id: r.id, name: r.name }))} />

      <p className="lead" style={{ marginTop: 18 }}>
        Excel-Import (nur für die Alt-Ausgaben nötig):{" "}
        <code>pnpm --filter sync exec tsx src/cli.ts preise:import --name=… --ab=… [--bis=…]</code>
      </p>
    </>
  );
}
