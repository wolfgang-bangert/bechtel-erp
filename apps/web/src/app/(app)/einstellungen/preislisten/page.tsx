import { createClient } from "@/lib/supabase/server";

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
        Zeitraum-gültige Ausgaben (Schwabenprint / IVS Abele). Die Auswahl je Auftrag läuft über das
        <strong> Versanddatum</strong> (Fallback Lieferdatum). Import &amp; Fortschreibung per CLI:
      </p>
      <pre className="code-block" style={{ whiteSpace: "pre-wrap" }}>
{`pnpm --filter sync exec tsx src/cli.ts preise:import \\
  --name="Schwabenprint bis 2026-08-31" --ab=2026-01-01 --bis=2026-08-31

pnpm --filter sync exec tsx src/cli.ts preise:rollover \\
  --basis="Schwabenprint bis 2026-08-31" --name="Schwabenprint ab 2026-09-01" \\
  --ab=2026-09-01 --prozent=5

pnpm --filter sync exec tsx src/cli.ts preise:match --all`}
      </pre>

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
                <td>{r.name}</td>
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
                <td colSpan={6} style={{ color: "var(--muted)" }}>Noch keine Preisliste importiert.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
