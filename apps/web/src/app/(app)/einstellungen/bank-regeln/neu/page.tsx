import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RegelForm } from "../RegelForm";
import { alleSachkonten } from "@/lib/sachkonten";

export const dynamic = "force-dynamic";

export default async function NeueBankRegelPage() {
  const supabase = await createClient();
  const { data: ledgerAccounts } = await alleSachkonten(supabase, "number, name", true);

  return (
    <>
      <p className="lead">
        <Link href="/einstellungen/bank-regeln">← Übersicht</Link>
      </p>
      <h1>Neue Sachkonto-Regel</h1>
      <RegelForm
        ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({ value: a.number, label: `${a.number} – ${a.name}` }))}
      />
    </>
  );
}
