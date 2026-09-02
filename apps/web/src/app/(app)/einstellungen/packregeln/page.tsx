import { createClient } from "@/lib/supabase/server";
import { PackregelTable, type Packregel } from "./ui";

export const dynamic = "force-dynamic";

export default async function PackregelnPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: pm }] = await Promise.all([
    supabase
      .from("packregel")
      .select("id, produkt_tag, stueck_von, stueck_bis, packmittel_id, spedition_erlaubt, prio, is_active")
      .order("produkt_tag")
      .order("stueck_bis"),
    supabase.from("packmittel").select("id, bezeichnung").eq("is_active", true).order("bezeichnung"),
  ]);

  return (
    <>
      <h1>Kartonregeln</h1>
      <p className="lead">
        Kapazitätsregeln für den Packstück-Vorschlag: greift, wenn der Produkt-Tag
        (Freitext) in der Positionsbezeichnung vorkommt und die Menge im Bereich liegt.
        Nur ein Vorschlag — in der Sendung frei überschreibbar. Startbestand aus Ninox
        (<code>packmittel:import</code>).
      </p>
      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}
      <PackregelTable
        rows={(data ?? []) as Packregel[]}
        packmittel={(pm ?? []) as { id: string; bezeichnung: string }[]}
      />
    </>
  );
}
