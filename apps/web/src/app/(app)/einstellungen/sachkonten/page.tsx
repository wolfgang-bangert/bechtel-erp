import { createClient } from "@/lib/supabase/server";
import { LedgerAccountTable, type LedgerAccount } from "./ui";
import { alleSachkonten } from "@/lib/sachkonten";

export const dynamic = "force-dynamic";

export default async function SachkontenPage() {
  const supabase = await createClient();
  const { data, error } = await alleSachkonten<{ id: string; number: string; name: string; kind: string; is_system: boolean; is_active: boolean }>(supabase, "id, number, name, kind, is_system, is_active");

  return (
    <>
      <h1>Sachkonten</h1>
      <p className="lead">
        SKR03-Konten für Kontierung und DATEV-Export. Systemkonten sind nicht
        löschbar; eigene Konten frei anlegbar.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <LedgerAccountTable rows={(data ?? []) as LedgerAccount[]} />
    </>
  );
}
