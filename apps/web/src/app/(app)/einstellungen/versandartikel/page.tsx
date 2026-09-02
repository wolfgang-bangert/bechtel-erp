import { createClient } from "@/lib/supabase/server";
import { ArtikelTable, type Artikel } from "./ui";

export const dynamic = "force-dynamic";

export default async function VersandartikelPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("versand_artikel")
    .select("id, bezeichnung, einheit, gewicht_kg, ean, is_active")
    .order("bezeichnung");

  return (
    <>
      <h1>Versandartikel</h1>
      <p className="lead">
        Wiederkehrende Sendungsinhalte mit Gewicht je Einheit. In der Positionserfassung
        (Sendung, Schritt 3) wählbar → Positionsgewicht = Menge × kg/Einheit.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <ArtikelTable rows={(data ?? []) as Artikel[]} />
    </>
  );
}
