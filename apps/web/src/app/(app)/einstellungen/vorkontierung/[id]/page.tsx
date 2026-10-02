import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegelForm, type Regel } from "../RegelForm";

export const dynamic = "force-dynamic";

export default async function VorkontierungEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, { data: ledgerAccounts }] = await Promise.all([
    supabase
      .from("posting_rule")
      .select(
        "id, organization_id, expense_account, revenue_account, payment_method, note, is_active, organization:organization_id(name, customer_number, supplier_number)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("ledger_account").select("number, name").eq("is_active", true).order("number"),
  ]);
  if (!data) notFound();

  const org = data.organization as unknown as {
    name: string;
    customer_number: string | null;
    supplier_number: string | null;
  } | null;
  const organizationLabel = org
    ? `${org.name}${org.customer_number ? ` · Kd ${org.customer_number}` : ""}${
        org.supplier_number ? ` · Lief ${org.supplier_number}` : ""
      }`
    : undefined;

  return (
    <>
      <p className="lead">
        <Link href="/einstellungen/vorkontierung">← Übersicht</Link>
      </p>
      <h1>Regel: {org?.name ?? "?"}</h1>
      <RegelForm
        regel={data as Regel}
        organizationLabel={organizationLabel}
        organizations={[]}
        ledgerAccounts={(ledgerAccounts ?? []).map((a) => ({ value: a.number, label: `${a.number} – ${a.name}` }))}
      />
    </>
  );
}
