import { createClient } from "@/lib/supabase/server";
import { NumberSequenceTable, type NumberSequence } from "./ui";

export const dynamic = "force-dynamic";

export default async function NummernkreisePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("number_sequence")
    .select("key, prefix, suffix, padding, period, period_value, current_value")
    .order("key");

  return (
    <>
      <h1>Nummernkreise</h1>
      <p className="lead">
        Präfix, Stellen und Jahres-Reset sind einstellbar. Der aktuelle Zählerstand
        wird bewusst nicht angezeigt/geändert (GoBD: lückenlose Vergabe).
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <NumberSequenceTable rows={(data ?? []) as NumberSequence[]} />
    </>
  );
}
