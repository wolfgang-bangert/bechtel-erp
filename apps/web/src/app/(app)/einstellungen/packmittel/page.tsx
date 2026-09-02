import { createClient } from "@/lib/supabase/server";
import { PackmittelTable, type Packmittel } from "./ui";

export const dynamic = "force-dynamic";

export default async function PackmittelPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packmittel")
    .select(
      "id, bezeichnung, kategorie, laenge_mm, breite_mm, hoehe_mm, leergewicht_kg, max_fuellgewicht_kg, material, is_active",
    )
    .order("bezeichnung");

  return (
    <>
      <h1>Kartonagen</h1>
      <p className="lead">
        Verpackungsstamm für die Sendungserfassung. Startbestand aus Ninox
        (<code>pnpm --filter sync packmittel:import</code>). Maße in mm.
      </p>
      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}
      <PackmittelTable rows={(data ?? []) as Packmittel[]} />
    </>
  );
}
