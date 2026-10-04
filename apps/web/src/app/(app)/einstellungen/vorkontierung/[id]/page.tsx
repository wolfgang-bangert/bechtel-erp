import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegelForm, type Regel } from "../RegelForm";

export const dynamic = "force-dynamic";

/** id = Organisation: Standardkonten/Zahlart direkt an der Organisation bearbeiten. */
export default async function VorkontierungEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: org }, { data: ledgerAccounts }] = await Promise.all([
    supabase
      .from("organization")
      .select("id, name, customer_number, supplier_number, default_expense_account, default_revenue_account, default_payment_method, foreign_supply_kind")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("ledger_account").select("number, name").eq("is_active", true).order("number"),
  ]);
  if (!org) notFound();

  const organizationLabel = `${org.name}${org.customer_number ? ` · Kd ${org.customer_number}` : ""}${
    org.supplier_number ? ` · Lief ${org.supplier_number}` : ""
  }`;
  const regel: Regel = {
    organization_id: org.id,
    expense_account: org.default_expense_account,
    revenue_account: org.default_revenue_account,
    payment_method: org.default_payment_method,
    foreign_supply_kind: org.foreign_supply_kind,
  };

  return (
    <>
      <p className="lead">
        <Link href="/einstellungen/vorkontierung">← Übersicht</Link>
        {" · "}
        <Link href={`/organisationen/${org.id}`}>Organisation öffnen</Link>
      </p>
      <h1>Vorkontierung: {org.name}</h1>
      <RegelForm
        regel={regel}
        organizationLabel={organizationLabel}
        organizations={[]}
        ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({ value: a.number, label: `${a.number} – ${a.name}` }))}
      />
    </>
  );
}
