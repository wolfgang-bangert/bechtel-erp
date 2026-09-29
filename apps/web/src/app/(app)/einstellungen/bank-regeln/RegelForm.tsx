"use client";

import { useActionState, useState } from "react";
import { saveRegel, deleteRegel, type State } from "./actions";
import { AccountPicker } from "../../_shared/AccountPicker";

export type Regel = {
  id: string;
  counterparty_name: string;
  ledger_account: string;
  sample_postingtext: string | null;
  is_active: boolean;
};

const empty: State = {};

export function RegelForm({
  regel,
  ledgerAccounts,
}: {
  regel?: Regel;
  ledgerAccounts: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveRegel, empty);
  const [dState, dAction] = useActionState(deleteRegel, empty);
  const [ledgerAccount, setLedgerAccount] = useState(regel?.ledger_account ?? "");

  return (
    <form action={action} className="rows" style={{ gap: 14, maxWidth: 520 }}>
      {regel && <input type="hidden" name="id" value={regel.id} />}

      <div className="field">
        <label htmlFor="counterparty_name">Gegenseite (Bank-Verwendungszweck/Name)</label>
        <input
          id="counterparty_name"
          name="counterparty_name"
          defaultValue={regel?.counterparty_name}
          placeholder="z.B. Tesla DE Supercharger"
          required
        />
      </div>

      <div className="field">
        <label>Sachkonto</label>
        <AccountPicker name="ledger_account" value={ledgerAccount} onChange={setLedgerAccount} accounts={ledgerAccounts} />
      </div>

      <div className="field">
        <label htmlFor="sample_postingtext">Buchungstext-Vorschlag (optional)</label>
        <input
          id="sample_postingtext"
          name="sample_postingtext"
          defaultValue={regel?.sample_postingtext ?? ""}
          placeholder="wird als Notiz-Vorschlag in der Sonderbuchung angezeigt"
        />
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
