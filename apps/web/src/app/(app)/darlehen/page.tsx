import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtEur } from "@/lib/format";
import { BankAvatar, BankNameEdit } from "../bank/TransactionRow";

export const dynamic = "force-dynamic";

/** Darlehenskonten - laufen über denselben FinTS-Abruf wie /bank, gehören
 *  aber nicht in die Übersicht des laufenden Zahlungsgeschäfts (siehe dort:
 *  bank_account.kind = 'darlehen'). Reiner Überblick, keine Zuordnung nötig. */
export default async function DarlehenPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("bank_account")
    .select("id, iban, label, bank_name, balance, balance_date")
    .eq("kind", "darlehen")
    .order("label");

  const ids = (accounts ?? []).map((a) => a.id);
  const { data: transactions } = ids.length
    ? await supabase
        .from("bank_transaction")
        .select("id, bank_account_id, booking_date, amount, counterparty_name, purpose")
        .in("bank_account_id", ids)
        .order("booking_date", { ascending: false })
        .limit(200)
    : { data: [] };

  return (
    <div className="rows">
      <h1>Darlehen</h1>
      <p className="count">
        Darlehenskonten - werden mit abgerufen, tauchen aber bewusst nicht in der
        Bank-Übersicht auf.
      </p>

      {(accounts ?? []).length === 0 && <p className="count">Keine Darlehenskonten hinterlegt.</p>}

      {(accounts ?? []).map((a) => (
        <div key={a.id} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <BankAvatar name={a.bank_name || a.label} />
              <strong>{a.bank_name || a.label}</strong>
              <span className="count">(…{a.iban.slice(-6)})</span>
              <BankNameEdit accountId={a.id} bankName={a.bank_name} />
            </span>
            <span style={{ textAlign: "right" }}>
              <div
                style={{ fontWeight: 700, fontSize: 16 }}
                className={a.balance != null && Number(a.balance) < 0 ? "msg-err" : ""}
              >
                {a.balance != null ? fmtEur(Number(a.balance)) : "—"}
              </div>
              <div className="count">{a.balance_date ? `Stand ${fmtDate(a.balance_date)}` : "noch kein Abruf"}</div>
            </span>
          </div>

          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th style={{ textAlign: "right" }}>Betrag</th>
                  <th>Verwendungszweck</th>
                </tr>
              </thead>
              <tbody>
                {(transactions ?? [])
                  .filter((t) => t.bank_account_id === a.id)
                  .map((t) => (
                    <tr key={t.id}>
                      <td>{fmtDate(t.booking_date)}</td>
                      <td style={{ textAlign: "right" }} className={t.amount < 0 ? "msg-err" : ""}>
                        {fmtEur(t.amount)}
                      </td>
                      <td>{t.counterparty_name ? `${t.counterparty_name} - ` : ""}{t.purpose ?? "–"}</td>
                    </tr>
                  ))}
                {(transactions ?? []).filter((t) => t.bank_account_id === a.id).length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--muted)" }}>
                      Keine Umsätze.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
