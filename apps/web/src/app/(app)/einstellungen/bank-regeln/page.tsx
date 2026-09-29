import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BankRegelnPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: ledgerAccounts }] = await Promise.all([
    supabase
      .from("bank_ledger_rule")
      .select("id, counterparty_name, ledger_account, sample_count, confidence, source, is_active")
      .order("counterparty_name"),
    supabase.from("ledger_account").select("number, name"),
  ]);
  const accountName = new Map((ledgerAccounts ?? []).map((a) => [a.number, a.name]));

  const rows = data ?? [];

  return (
    <>
      <h1>Bank — Sachkonto-Regeln</h1>
      <p className="lead">
        Vorschläge für beleglose Bankbuchungen (Sonderbuchung auf der Bank-Seite), je Gegenseite - aus der
        BuchhaltungsButler-Historie gelernt oder von Hand angelegt. Handeinträge (<code>manuell</code>)
        werden vom automatischen Lernen nie überschrieben.
      </p>

      <div className="toolbar">
        <Link className="ghost" href="/einstellungen/bank-regeln/neu" style={{ padding: "7px 12px" }}>
          + Neue Regel
        </Link>
        <span className="count">{rows.length} Regeln</span>
      </div>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Gegenseite</th>
              <th>Sachkonto</th>
              <th>Herkunft</th>
              <th style={{ textAlign: "right" }}>Belege</th>
              <th style={{ textAlign: "right" }}>Konfidenz</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                <td>
                  <Link href={`/einstellungen/bank-regeln/${r.id}`}>{r.counterparty_name}</Link>
                </td>
                <td className="count">
                  {r.ledger_account} – {accountName.get(r.ledger_account) ?? "?"}
                </td>
                <td>
                  <span className="tag">{r.source === "manual" ? "manuell" : "gelernt"}</span>
                </td>
                <td style={{ textAlign: "right" }}>{r.sample_count ?? "–"}</td>
                <td style={{ textAlign: "right" }}>
                  {r.confidence != null ? `${Math.round(r.confidence * 100)} %` : "–"}
                </td>
                <td>{r.is_active ? "aktiv" : "inaktiv"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Noch keine Regeln. <code>pnpm --filter sync bb:learn-bankregeln</code> lernt aus der
                  BuchhaltungsButler-Historie, oder hier von Hand anlegen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
