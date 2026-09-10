import { createClient } from "@/lib/supabase/server";
import { OpriProdukte, type Gruppe, type Stamm, type TplOpt } from "./ui";

export const dynamic = "force-dynamic";

export default async function OpriProduktePage() {
  const supabase = await createClient();
  const [{ data: gruppen, error: e1 }, { data: stamm, error: e2 }, { data: templates }] = await Promise.all([
    supabase
      .from("opri_produkt_gruppe")
      .select("id, kuerzel, name, titel_kuerzel, flux_template, flux_template_id, druckverfahren")
      .order("kuerzel"),
    supabase
      .from("opri_stammartikel")
      .select("id, gruppe_id, sku, name, flux_template, flux_template_id")
      .order("sku")
      .limit(2000),
    supabase.from("flux_template").select("id, name, flux_product").eq("is_active", true).order("name"),
  ]);

  return (
    <>
      <h1>onlineprinters — Produkte / Flux-Template</h1>
      <p className="lead">
        flux-Template je Produktgruppe (Default) und je Stammartikel (Override, leer = erben).
        Für einzelne Bauteile kann eine <a href="/einstellungen/opri-regeln">Materialregel</a> ein
        eigenes Template setzen. Das Feld „Produkt (Text)" ist der alte Freitext-Fallback.
      </p>
      {(e1 || e2) && <div className="banner-err">Fehler: {(e1 ?? e2)?.message}</div>}
      <OpriProdukte
        gruppen={(gruppen ?? []) as Gruppe[]}
        stamm={(stamm ?? []) as Stamm[]}
        templates={(templates ?? []) as TplOpt[]}
      />
    </>
  );
}
