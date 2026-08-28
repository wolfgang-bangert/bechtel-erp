import { createClient } from "@/lib/supabase/server";
import { CostCenterTable, type CostCenter } from "./ui";

export const dynamic = "force-dynamic";

export default async function KostenstellenPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cost_center")
    .select("id, number, name, is_active")
    .order("number");

  return (
    <>
      <h1>Kostenstellen</h1>
      <p className="lead">
        Für Auswertung und DATEV-Export. Werden Belegpositionen zugeordnet.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <CostCenterTable rows={(data ?? []) as CostCenter[]} />
    </>
  );
}
