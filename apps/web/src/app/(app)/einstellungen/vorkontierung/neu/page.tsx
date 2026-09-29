import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RegelForm } from "../RegelForm";

export const dynamic = "force-dynamic";

export default async function NeueVorkontierungPage() {
  const supabase = await createClient();
  const [{ data: organizations }, { data: ledgerAccounts }] = await Promise.all([
    supabase
      .from("organization")
      .select("id, name, customer_number, supplier_number")
      .order("name"),
    supabase.from("ledger_account").select("number, name").eq("is_active", true).order("number"),
  ]);

  return (
    <>
      <p className="lead">
        <Link href="/einstellungen/vorkontierung">← Übersicht</Link>
      </p>
      <h1>Neue Vorkontierung</h1>
      <RegelForm
        organizations={(organizations ?? []).map((o) => ({
          value: o.id,
          label: `${o.name}${o.customer_number ? ` · Kd ${o.customer_number}` : ""}${
            o.supplier_number ? ` · Lief ${o.supplier_number}` : ""
          }`,
        }))}
        ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({ value: a.number, label: `${a.number} – ${a.name}` }))}
      />
    </>
  );
}
