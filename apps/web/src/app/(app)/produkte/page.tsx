import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KopierenForm } from "./KopierenForm";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  art: string;
  sprache: string | null;
  is_active: boolean;
  kapitel: { count: number }[];
  teile: { count: number }[];
};

export default async function ProduktePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produkt")
    .select("id, name, art, sprache, is_active, kapitel:produkt_kapitel(count), teile:produktteil(count)")
    .order("name");
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <h1>Produkte</h1>
      <p className="lead">
        Produktstruktur (erste Stufe: Handbücher mit Registern). Ein Produkt je Sprachversion; Kapitel = Unterregister +
        Inhalt, Hauptregister als eigener Teil.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Art</th>
              <th>Sprache</th>
              <th style={{ textAlign: "right" }}>Kapitel</th>
              <th style={{ textAlign: "right" }}>Teile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/produkte/${r.id}`}>{r.name}</Link>
                </td>
                <td>{r.art}</td>
                <td>{r.sprache ? r.sprache.toUpperCase() : "—"}</td>
                <td style={{ textAlign: "right" }}>{r.kapitel?.[0]?.count ?? 0}</td>
                <td style={{ textAlign: "right" }}>{r.teile?.[0]?.count ?? 0}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="count">
                  Noch keine Produkte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rows" style={{ marginTop: 16 }}>
        <KopierenForm produkte={rows.map((r) => ({ id: r.id, name: r.name }))} />
      </div>
    </>
  );
}
