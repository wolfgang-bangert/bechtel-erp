import { createClient } from "@/lib/supabase/server";
import { OpriProdukte, type Gruppe, type Stamm } from "./ui";

export const dynamic = "force-dynamic";

export default async function OpriProduktePage() {
  const supabase = await createClient();
  const [{ data: gruppen, error: e1 }, { data: stamm, error: e2 }] = await Promise.all([
    supabase.from("opri_produkt_gruppe").select("id, kuerzel, name, flux_template, druckverfahren").order("kuerzel"),
    supabase.from("opri_stammartikel").select("id, gruppe_id, sku, name, flux_template").order("sku").limit(2000),
  ]);

  return (
    <>
      <h1>onlineprinters — Produkte / Flux-Template</h1>
      <p className="lead">
        `flux_template` je Produktgruppe (Default) und je Stammartikel (Override, leer = erben).
        Startbestand aus <code>opri:import-sku</code>.
      </p>
      {(e1 || e2) && <div className="banner-err">Fehler: {(e1 ?? e2)?.message}</div>}
      <OpriProdukte
        gruppen={(gruppen ?? []) as Gruppe[]}
        stamm={(stamm ?? []) as Stamm[]}
      />
    </>
  );
}
