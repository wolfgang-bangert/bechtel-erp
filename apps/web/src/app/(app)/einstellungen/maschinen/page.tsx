import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MaschinenListTable, type Maschine } from "./ui";
import { FluxRefreshButton } from "@/lib/flux/FluxRefreshButton";

export const dynamic = "force-dynamic";

export default async function MaschinenPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: costCenters }] = await Promise.all([
    supabase
      .from("maschine")
      .select(
        "id, name, typ, nummer, cost_center_id, flux_printer_name, farbe, kapazitaet_bogen_h, sortierung, aktiv, druckverfahren, max_farben, formate, geladen",
      )
      .order("sortierung")
      .order("name"),
    supabase.from("cost_center").select("id, number, name").order("number"),
  ]);

  const costCenterLabel = new Map((costCenters ?? []).map((c) => [c.id, `${c.number} – ${c.name}`]));

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Maschinen</h1>
        <div className="toolbar" style={{ gap: 10 }}>
          <FluxRefreshButton />
          <Link href="/einstellungen/maschinen/neu">+ Neue Maschine</Link>
        </div>
      </div>
      <p className="lead">
        Stationen für die Maschinenplanung, gruppiert nach Typ. Name klicken für Rüstzustand,
        flux-Zuordnung, Kostenstelle und{" "}
        <Link href="/einstellungen/faehigkeiten">Fähigkeiten</Link>.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <MaschinenListTable rows={(data ?? []) as unknown as Maschine[]} costCenterLabel={costCenterLabel} />
    </>
  );
}
