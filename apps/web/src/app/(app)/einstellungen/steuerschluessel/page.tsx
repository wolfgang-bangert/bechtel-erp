import { createClient } from "@/lib/supabase/server";
import { TaxCodeTable, type TaxCode } from "./ui";

export const dynamic = "force-dynamic";

export default async function SteuerschluesselPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_code")
    .select("id, code, name, rate, treatment, direction, datev_tax_key, is_system, is_active")
    .order("direction")
    .order("code");

  return (
    <>
      <h1>Steuerschlüssel</h1>
      <p className="lead">
        Sätze und DATEV-BU-Schlüssel für Rechnungen und Eingangsbelege. Mit dem
        Steuerberater abstimmen. Systemschlüssel sind nicht löschbar.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <TaxCodeTable rows={(data ?? []) as TaxCode[]} />
    </>
  );
}
