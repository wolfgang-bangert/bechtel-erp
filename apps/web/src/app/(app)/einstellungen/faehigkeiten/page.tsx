import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaehigkeitTable, type Faehigkeit } from "./ui";

export const dynamic = "force-dynamic";

export default async function FaehigkeitenPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faehigkeit")
    .select("key, label, taetigkeit, art, einheit, optionen, sortierung")
    .order("sortierung")
    .order("label");

  return (
    <>
      <h1>Fähigkeiten</h1>
      <p className="lead">
        Katalog der Maschinen-Fähigkeiten – wie Produkt-Attribute, nur für Maschinen. Die{" "}
        <b>Tätigkeit</b> (Drucken, Binden …) entspricht dem Maschinentyp; <b>alle</b> gilt
        übergreifend. Die <b>Art</b> bestimmt das Eingabefeld je Maschine:
        Liste = Mehrfachauswahl aus den Optionen, Max/Min = Zahl, Ja/Nein = Haken, Text = frei.
        Werte pflegst du je Maschine unter{" "}
        <Link href="/einstellungen/maschinen">Maschinen</Link>.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <FaehigkeitTable rows={(data ?? []) as unknown as Faehigkeit[]} />
    </>
  );
}
