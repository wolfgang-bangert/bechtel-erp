import { createClient } from "@/lib/supabase/server";
import { MaschinenTable, type Maschine } from "./ui";

export const dynamic = "force-dynamic";

export default async function MaschinenPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maschine")
    .select("id, name, typ, flux_printer_name, farbe, kapazitaet_bogen_h, sortierung, aktiv")
    .order("sortierung")
    .order("name");

  return (
    <>
      <h1>Maschinen</h1>
      <p className="lead">
        Stationen für die Maschinenplanung. Jeder Batch wird im{" "}
        <a href="/druck/plan">Belegungs-Board</a> einer Maschine zugeordnet. Der Typ steuert,
        welche Batches (Drucken / Cellophanieren / Binden / Konfektion) auf der Maschine landen
        können.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <MaschinenTable rows={(data ?? []) as Maschine[]} />
    </>
  );
}
