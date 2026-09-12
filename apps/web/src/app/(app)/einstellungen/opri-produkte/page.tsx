import { createClient } from "@/lib/supabase/server";
import { fluxCatalog } from "@/lib/flux/catalog";
import { FluxRefreshButton } from "@/lib/flux/FluxRefreshButton";
import { OpriProdukte, type Gruppe, type Stamm } from "./ui";

export const dynamic = "force-dynamic";

export default async function OpriProduktePage() {
  const supabase = await createClient();
  const [{ data: gruppen, error: e1 }, { data: stamm, error: e2 }, cat] = await Promise.all([
    supabase
      .from("opri_produkt_gruppe")
      .select("id, kuerzel, name, titel_kuerzel, flux_product, flux_services, druckverfahren")
      .order("kuerzel"),
    supabase
      .from("opri_stammartikel")
      .select("id, gruppe_id, sku, name, flux_product, flux_services")
      .order("sku")
      .limit(2000),
    fluxCatalog(),
  ]);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>onlineprinters — Produkte / Flux</h1>
        <FluxRefreshButton />
      </div>
      <p className="lead">
        flux-Produkt + Service-Overrides je Produktgruppe (Default für alle Varianten) und je
        Stammartikel (Override, leer = erben). Für einzelne Bauteile kann eine{" "}
        <a href="/einstellungen/opri-regeln">Materialregel</a> ein eigenes Produkt/Services setzen.
        Standbogen (Signature/Nutzen/Druckbogen) kommt automatisch aus den{" "}
        <a href="/einstellungen/standbogen">Standbögen</a>, Papier aus dem Materialkatalog.
      </p>
      {(e1 || e2) && <div className="banner-err">Fehler: {(e1 ?? e2)?.message}</div>}
      <OpriProdukte
        gruppen={(gruppen ?? []) as Gruppe[]}
        stamm={(stamm ?? []) as Stamm[]}
        products={cat.ok ? cat.products : []}
        catalogError={cat.ok ? undefined : cat.error}
      />
    </>
  );
}
