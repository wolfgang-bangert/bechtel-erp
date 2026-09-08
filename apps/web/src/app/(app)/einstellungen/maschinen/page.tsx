import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { MaschinenTable, type Maschine } from "./ui";

export const dynamic = "force-dynamic";

export default async function MaschinenPage() {
  const supabase = await createClient();
  const [{ data, error }, cat] = await Promise.all([
    supabase
      .from("maschine")
      .select(
        "id, name, typ, flux_printer_name, farbe, kapazitaet_bogen_h, sortierung, aktiv, " +
          "druckverfahren, max_farben, formate, geladen",
      )
      .order("sortierung")
      .order("name"),
    fluxCatalog(),
  ]);

  return (
    <>
      <h1>Maschinen</h1>
      <p className="lead">
        Stationen für die Maschinenplanung, gruppiert nach Typ. Bei Druckmaschinen legen
        Druckverfahren, max. Farben, Formate und der Rüstzustand (geladene Materialien – bis zu
        9 Magazine je Digitaldrucker) fest, welche Druck-Batches automatisch zugeordnet werden –
        manuell im <a href="/druck/plan">Belegungs-Board</a> verschieben geht weiterhin.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <MaschinenTable
        rows={(data ?? []) as unknown as Maschine[]}
        printers={cat.ok ? cat.printers.map((p) => p.name) : []}
        catalogError={cat.ok ? undefined : cat.error}
      />
    </>
  );
}
