import { createClient } from "@/lib/supabase/server";
import { BatchGruppierung } from "./ui";

export const dynamic = "force-dynamic";

export default async function BatchGruppierungPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("setting")
    .select("value")
    .eq("key", "batch_gruppierung")
    .maybeSingle();
  const cfg = (data?.value as Record<string, string[]>) ?? {};

  return (
    <>
      <h1>Batch-Gruppierung</h1>
      <p className="lead">
        Welche Felder einen Batch-Schlüssel bilden – je Arbeitsvorgang. Aufträge mit gleichem
        Schlüssel laufen in einen Batch. Beim Binden gruppieren wir nach Bindeseite, Schlaufen
        (= Bindelänge), Spiralfarbe, Teilung und Durchmesser.
      </p>
      <BatchGruppierung cfg={cfg} />
    </>
  );
}
