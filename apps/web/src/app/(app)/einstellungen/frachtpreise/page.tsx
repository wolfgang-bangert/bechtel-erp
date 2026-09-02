import { createClient } from "@/lib/supabase/server";
import { FrachtpreisEditor, type Carrier, type Rate } from "./ui";

export const dynamic = "force-dynamic";

export default async function FrachtpreisePage() {
  const supabase = await createClient();
  const [{ data: carriers, error: cErr }, { data: rates, error: rErr }, { data: zones }] =
    await Promise.all([
      supabase.from("carrier").select("id, code, name, art").order("art").order("name"),
      supabase
        .from("carrier_rate")
        .select("id, carrier_id, produkt, zone, kg_von, kg_bis, preis, gilt_ab, gilt_bis"),
      supabase.from("carrier_zone").select("carrier_id"),
    ]);

  const zoneCount = new Map<string, number>();
  for (const z of zones ?? []) zoneCount.set(z.carrier_id, (zoneCount.get(z.carrier_id) ?? 0) + 1);

  const carrierRows: Carrier[] = (carriers ?? []).map((c) => ({
    ...c,
    zonen: zoneCount.get(c.id) ?? 0,
  }));

  return (
    <>
      <h1>Frachtpreise</h1>
      <p className="lead">
        Preisstaffeln je Frachtdienstleister. Zone leer = zonenunabhängig (DHL Einheitspreis,
        DPD, Post). Zonen (PLZ&nbsp;→&nbsp;Zone) kommen aus dem Ninox-Import
        (<code>pnpm --filter sync fracht:import</code>).
      </p>

      {(cErr || rErr) && (
        <div className="banner-err">Fehler beim Laden: {(cErr ?? rErr)?.message}</div>
      )}

      <FrachtpreisEditor carriers={carrierRows} rates={(rates ?? []) as Rate[]} />
    </>
  );
}
