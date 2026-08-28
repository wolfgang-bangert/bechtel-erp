import { createClient } from "@/lib/supabase/server";
import { LedgerAccountTable, type LedgerAccount } from "./ui";

export const dynamic = "force-dynamic";

export default async function SachkontenPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_account")
    .select("id, number, name, kind, is_system, is_active")
    .order("number");

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
