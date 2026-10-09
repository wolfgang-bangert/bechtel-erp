import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegelForm, type Regel } from "../RegelForm";
import { alleSachkonten } from "@/lib/sachkonten";

export const dynamic = "force-dynamic";

export default async function BankRegelEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, { data: ledgerAccounts }] = await Promise.all([
    supabase
      .from("bank_ledger_rule")
      .select("id, counterparty_name, ledger_account, sample_postingtext, is_active")
      .eq("id", id)
      .maybeSingle(),
    alleSachkonten(supabase, "number, name", true),
  ]);
  if (!data) notFound();

  return (
    <>
      <p className="lead">
        <Link href="/einstellungen/bank-regeln">← Übersicht</Link>
      </p>
      <h1>Regel: {data.counterparty_name}</h1>
      <RegelForm
        regel={data as Regel}
        ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({ value: a.number, label: `${a.number} – ${a.name}` }))}
      />
    </>
  );
}
