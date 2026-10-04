import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  card: "Kreditkarte",
  paypal: "PayPal",
  transfer: "Überweisung",
  direct_debit: "Lastschrift",
};

type Row = {
  id: string;
  name: string;
  customer_number: string | null;
  supplier_number: string | null;
  default_expense_account: string | null;
  default_revenue_account: string | null;
  default_payment_method: string | null;
  foreign_supply_kind: string | null;
  vorkontierung_source: string | null;
  vorkontierung_confidence: number | null;
};

export default async function VorkontierungPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: ledgerAccounts }] = await Promise.all([
    supabase
      .from("organization")
      .select(
        "id, name, customer_number, supplier_number, default_expense_account, default_revenue_account, default_payment_method, foreign_supply_kind, vorkontierung_source, vorkontierung_confidence",
      )
      .or("default_expense_account.not.is.null,default_revenue_account.not.is.null,default_payment_method.not.is.null,foreign_supply_kind.not.is.null")
      .order("name"),
    supabase.from("ledger_account").select("number, name"),
  ]);
  const accountName = new Map((ledgerAccounts ?? []).map((a) => [a.number, a.name]));
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <h1>Vorkontierung — Kreditor/Debitor</h1>
      <p className="lead">
        Je Organisation ein gelerntes oder von Hand gesetztes Standardkonto: Aufwandskonto für
        Eingangsrechnungen (Kreditor), Erlöskonto für Ausgangsrechnungen (Debitor) und eine feste Zahlart
        - ersetzt bei Ausgangsrechnungen das Inlands-Automatikkonto (19%/7%). Die Werte stehen direkt an
        der Organisation und lassen sich auch dort einsehen. Der Steuerschlüssel kommt nicht von hier,
        sondern aus der USt-Prüfung des Belegs.
      </p>

      <div className="toolbar">
        <Link className="ghost" href="/einstellungen/vorkontierung/neu" style={{ padding: "7px 12px" }}>
          + Neue Vorkontierung
        </Link>
        <span className="count">{rows.length} Organisationen</span>
      </div>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Aufwandskonto (Kreditor)</th>
              <th>Erlöskonto (Debitor)</th>
              <th>Zahlart</th>
              <th>Ausland</th>
              <th>Herkunft</th>
              <th style={{ textAlign: "right" }}>Konfidenz</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/einstellungen/vorkontierung/${r.id}`}>{r.name}</Link>
                  {r.customer_number && <span className="count"> · Kd {r.customer_number}</span>}
                  {r.supplier_number && <span className="count"> · Lief {r.supplier_number}</span>}
                </td>
                <td className="count">
                  {r.default_expense_account
                    ? `${r.default_expense_account} – ${accountName.get(r.default_expense_account) ?? "?"}`
                    : "–"}
                </td>
                <td className="count">
                  {r.default_revenue_account
                    ? `${r.default_revenue_account} – ${accountName.get(r.default_revenue_account) ?? "?"}`
                    : "–"}
                </td>
                <td className="count">
                  {r.default_payment_method ? (PAYMENT_LABEL[r.default_payment_method] ?? r.default_payment_method) : "–"}
                </td>
                <td className="count">
                  {r.foreign_supply_kind === "service" ? "Dienstleistung" : r.foreign_supply_kind === "goods" ? "Ware" : "–"}
                </td>
                <td>
                  <span className="tag">{r.vorkontierung_source === "learned" ? "gelernt" : "manuell"}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.vorkontierung_confidence != null ? `${Math.round(r.vorkontierung_confidence * 100)} %` : "–"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>
                  Noch keine Vorkontierung. <code>pnpm --filter sync bb:learn-vorkontierung</code> /{" "}
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
