import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { MaschinenTable, type Maschine } from "./ui";
import type { Faehigkeit } from "./FaehigkeitenEditor";

export const dynamic = "force-dynamic";

export default async function MaschinenPage() {
  const supabase = await createClient();
  const [{ data, error }, cat, { data: faeh }, { data: mfRows }] = await Promise.all([
    supabase
      .from("maschine")
      .select(
        "id, name, typ, flux_printer_name, farbe, kapazitaet_bogen_h, sortierung, aktiv, " +
          "druckverfahren, max_farben, formate, geladen",
      )
      .order("sortierung")
      .order("name"),
    fluxCatalog(),
    supabase
      .from("faehigkeit")
      .select("key, label, taetigkeit, art, einheit, optionen")
      .order("sortierung")
      .order("label"),
    supabase.from("maschine_faehigkeit").select("maschine_id, faehigkeit_key, wert"),
  ]);

  const werte: Record<string, Record<string, unknown>> = {};
  for (const r of mfRows ?? []) {
    const mid = r.maschine_id as string;
    (werte[mid] ??= {})[r.faehigkeit_key as string] = r.wert;
  }

  return (
    <>
      <h1>Maschinen</h1>
      <p className="lead">
        Stationen für die Maschinenplanung, gruppiert nach Typ. Der Rüstzustand (geladene
        Materialien – bis zu 9 Magazine je Digitaldrucker) steht direkt am Formular; was die
        Maschine grundsätzlich kann, pflegst du als{" "}
        <Link href="/einstellungen/faehigkeiten">Fähigkeiten</Link> je Maschine.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <MaschinenTable
        rows={(data ?? []) as unknown as Maschine[]}
        printers={cat.ok ? cat.printers.map((p) => p.name) : []}
        catalogError={cat.ok ? undefined : cat.error}
        faehigkeiten={(faeh ?? []) as unknown as Faehigkeit[]}
        werte={werte}
      />
    </>
  );
}
