import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VorkontierungPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: ledgerAccounts }] = await Promise.all([
    supabase
      .from("posting_rule")
      .select(
        "id, expense_account, revenue_account, source, confidence, is_active, organization:organization_id(name, customer_number, supplier_number)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("ledger_account").select("number, name"),
  ]);
  const accountName = new Map((ledgerAccounts ?? []).map((a) => [a.number, a.name]));

  const rows = (data ?? []) as unknown as {
    id: string;
    expense_account: string | null;
    revenue_account: string | null;
    source: string;
    confidence: number | null;
    is_active: boolean;
    organization: { name: string; customer_number: string | null; supplier_number: string | null } | null;
  }[];

  return (
    <>
      <h1>Vorkontierung — Kreditor/Debitor</h1>
      <p className="lead">
        Je Organisation ein gelerntes oder von Hand gesetztes Standardkonto: Aufwandskonto für
        Eingangsrechnungen (Kreditor), Erlöskonto für Ausgangsrechnungen (Debitor) - ersetzt das
        Inlands-Automatikkonto (19%/7%) bei der Rechnungserzeugung.
      </p>

      <div className="toolbar">
        <Link className="ghost" href="/einstellungen/vorkontierung/neu" style={{ padding: "7px 12px" }}>
          + Neue Regel
        </Link>
        <span className="count">{rows.length} Regeln</span>
      </div>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Aufwandskonto (Kreditor)</th>
              <th>Erlöskonto (Debitor)</th>
              <th>Herkunft</th>
              <th style={{ textAlign: "right" }}>Konfidenz</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                <td>
                  <Link href={`/einstellungen/vorkontierung/${r.id}`}>{r.organization?.name ?? "?"}</Link>
                  {r.organization?.customer_number && (
                    <span className="count"> · Kd {r.organization.customer_number}</span>
                  )}
                  {r.organization?.supplier_number && (
                    <span className="count"> · Lief {r.organization.supplier_number}</span>
                  )}
                </td>
                <td className="count">
                  {r.expense_account ? `${r.expense_account} – ${accountName.get(r.expense_account) ?? "?"}` : "–"}
                </td>
                <td className="count">
                  {r.revenue_account ? `${r.revenue_account} – ${accountName.get(r.revenue_account) ?? "?"}` : "–"}
                </td>
                <td>
                  <span className="tag">{r.source === "manual" ? "manuell" : "gelernt"}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.confidence != null ? `${Math.round(r.confidence * 100)} %` : "–"}
                </td>
                <td>{r.is_active ? "aktiv" : "inaktiv"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Noch keine Regeln. <code>pnpm --filter sync bb:learn-vorkontierung</code> /{" "}
                  <code>bb:learn-vorkontierung-debitoren</code> lernen aus der BuchhaltungsButler-Historie,
                  oder hier von Hand anlegen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
