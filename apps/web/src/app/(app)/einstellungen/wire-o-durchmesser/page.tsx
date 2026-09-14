import { createClient } from "@/lib/supabase/server";
import { WireODurchmesserEditor, type Row } from "./ui";

export const dynamic = "force-dynamic";

export default async function WireODurchmesserPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("wire_o_durchmesser")
    .select("id, teilung, durchmesser_zoll, durchmesser_mm, blockstaerke_min, blockstaerke_max, bezeichnung")
    // nach Größe sortiert (durchmesser_mm), nicht alphabetisch nach dem
    // Bruch-Text ("3/4" würde sonst vor "5/16" einsortiert werden)
    .order("teilung", { ascending: true })
    .order("durchmesser_mm", { ascending: true });

  return (
    <>
      <h1>Wire-O Durchmesser</h1>
      <p className="lead">
        Legt fest, welcher Drahtbinder-Durchmesser ab welcher Produktstärke (Blockstärke) gewählt
        wird – je Teilung (3:1 / 2:1) eine eigene Schwellenwert-Reihe, lückenlos von-bis. Wird vom
        Resolver beim Auflösen eines Auftrags genutzt (<code>wireOFromBlock</code>).
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <WireODurchmesserEditor rows={(rows ?? []) as Row[]} />
    </>
  );
}
