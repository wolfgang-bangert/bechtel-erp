"use client";

import { useActionState, useState } from "react";
import { saveRegel, deleteRegel, type State } from "./actions";
import { AccountPicker } from "../../_shared/AccountPicker";

export type Regel = {
  organization_id: string;
  expense_account: string | null;
  revenue_account: string | null;
  payment_method: string | null;
  foreign_supply_kind: string | null;
};

const empty: State = {};

export function RegelForm({
  regel,
  organizationLabel,
  organizations,
  ledgerAccounts,
}: {
  regel?: Regel;
  organizationLabel?: string;
  organizations: { value: string; label: string }[];
  ledgerAccounts: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveRegel, empty);
  const [dState, dAction] = useActionState(deleteRegel, empty);
  const [organizationId, setOrganizationId] = useState(regel?.organization_id ?? "");
  const [expenseAccount, setExpenseAccount] = useState(regel?.expense_account ?? "");
  const [revenueAccount, setRevenueAccount] = useState(regel?.revenue_account ?? "");

  return (
    <form action={action} className="rows" style={{ gap: 14, maxWidth: 520 }}>

      <div className="field">
        <label>Organisation</label>
        {regel ? (
          <>
            <input type="hidden" name="organization_id" value={regel.organization_id} />
            <p className="count" style={{ margin: "6px 0" }}>
              {organizationLabel ?? regel.organization_id}
            </p>
          </>
        ) : (
          <AccountPicker
            name="organization_id"
            value={organizationId}
            onChange={setOrganizationId}
            accounts={organizations}
            placeholder="— Organisation wählen —"
          />
        )}
      </div>

      <div className="field">
        <label>Aufwandskonto (Kreditor / Eingangsrechnungen)</label>
        <AccountPicker
          name="expense_account"
          value={expenseAccount}
          onChange={setExpenseAccount}
          accounts={ledgerAccounts}
          placeholder="— kein Aufwandskonto —"
        />
      </div>

      <div className="field">
        <label>Erlöskonto (Debitor / Ausgangsrechnungen)</label>
        <AccountPicker
          name="revenue_account"
          value={revenueAccount}
          onChange={setRevenueAccount}
          accounts={ledgerAccounts}
          placeholder="— kein Erlöskonto —"
        />
      </div>

      <div className="field">
        <label htmlFor="foreign_supply_kind">Lieferant aus dem Ausland (USt)</label>
        <select id="foreign_supply_kind" name="foreign_supply_kind" defaultValue={regel?.foreign_supply_kind ?? ""}>
          <option value="">Standard (USD-Rechnung ohne USt = Dienstleistung)</option>
          <option value="service">Dienstleistung - Reverse Charge §13b, automatisch</option>
          <option value="goods">Ware - kein §13b (z.B. Einfuhr), USt immer von Hand</option>
        </select>
        <p className="count" style={{ margin: "4px 0 0" }}>
          Gilt für Rechnungen dieses Lieferanten ohne ausgewiesene USt. Bei „Ware" bleibt die USt-Prüfung
          bewusst ein Vorschlag.
        </p>
      </div>

      <div className="field">
        <label htmlFor="payment_method">Zahlart (immer, z.B. "WeWeb immer Kreditkarte")</label>
        <select id="payment_method" name="payment_method" defaultValue={regel?.payment_method ?? ""}>
          <option value="">— keine Vorgabe —</option>
          <option value="card">Kreditkarte</option>
          <option value="paypal">PayPal</option>
          <option value="transfer">Überweisung</option>
          <option value="direct_debit">Lastschrift</option>
        </select>
      </div>

      <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
        {regel && (
          <button
            type="submit"
            className="ghost"
            formAction={dAction}
            formNoValidate
            onClick={(e) => {
              if (!confirm("Vorkontierung dieser Organisation entfernen?")) e.preventDefault();
            }}
          >
            Entfernen
          </button>
        )}
        {state.error && <span className="msg-err">{state.error}</span>}
        {dState.error && <span className="msg-err">{dState.error}</span>}
      </div>
    </form>
  );
}
