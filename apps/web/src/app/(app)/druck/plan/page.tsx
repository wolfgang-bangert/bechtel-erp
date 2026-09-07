import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlanBoard, type Maschine, type PlanBatch } from "./PlanBoard";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const supabase = await createClient();

  const [{ data: maschinen }, { data: batches }] = await Promise.all([
    supabase
      .from("maschine")
      .select("id, name, typ, farbe, kapazitaet_bogen_h")
      .eq("aktiv", true)
      .order("sortierung")
      .order("name"),
    supabase
      .from("batch")
      .select(
        "id, nummer, typ, schluessel, cello, cello_seiten, papier, druckbogen, druckverfahren, " +
          "status, maschine_id, dauer_minuten, plan_reihenfolge, created_at, flux_order_id, " +
          "job(netto_bogen, auflage, zuschuss, schlaufen_gesamt)",
      )
      .neq("status", "storniert")
      .order("plan_reihenfolge", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Belegungs-Board</h1>
        <div className="toolbar" style={{ gap: 8 }}>
          <Link href="/druck" className="ghost" style={{ padding: "7px 12px" }}>
            ← Druck-Dashboard
          </Link>
          <Link href="/einstellungen/maschinen" className="ghost" style={{ padding: "7px 12px" }}>
            Maschinen
          </Link>
        </div>
      </div>
      <p className="lead">
        Batches per Drag &amp; Drop einer Maschine und Phase zuordnen. Spalten:
        Warteschlange · Läuft · Fertig. Innerhalb einer Zelle bestimmt die Reihenfolge die
        Abarbeitung. Der flux-Versand bleibt am Druck-Batch im Dashboard – hier ist „Läuft"
        eine manuelle Statusmarkierung.
      </p>

      <PlanBoard
        maschinen={(maschinen ?? []) as Maschine[]}
        batches={(batches ?? []) as unknown as PlanBatch[]}
      />
    </>
  );
}
