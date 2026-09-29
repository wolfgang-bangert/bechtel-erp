"use client";

import { useActionState, useState } from "react";
import { saveRegel, deleteRegel, type State } from "./actions";
import { AccountPicker } from "../../_shared/AccountPicker";

export type Regel = {
  id: string;
  organization_id: string;
  expense_account: string | null;
  revenue_account: string | null;
  note: string | null;
  is_active: boolean;
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
      {regel && <input type="hidden" name="id" value={regel.id} />}

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
        <label htmlFor="note">Notiz (optional)</label>
        <input id="note" name="note" defaultValue={regel?.note ?? ""} />
      </div>

      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={regel?.is_active ?? true} /> aktiv
      </label>

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
              if (!confirm("Regel löschen?")) e.preventDefault();
            }}
          >
            Löschen
          </button>
        )}
        {state.error && <span className="msg-err">{state.error}</span>}
        {dState.error && <span className="msg-err">{dState.error}</span>}
      </div>
    </form>
  );
}
