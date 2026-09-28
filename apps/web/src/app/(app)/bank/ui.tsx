"use client";

import { useActionState } from "react";
import { matchTransaction, matchSpecial, uploadBeleg, type MatchState, type UploadState } from "./actions";

const empty: MatchState = {};

export type Candidate = { number: string; label: string };

/** Eine <datalist> je Seite, von allen Zeilen per id genutzt. Wird nie geclippt. */
export function InvoiceDatalist({ id, options }: { id: string; options: Candidate[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o.number} value={o.label} />
      ))}
    </datalist>
  );
}

export function MatchForm({
  txId,
  listId,
  side = "debitor",
  defaultValue,
  hint,
  showAmount = false,
  remaining,
}: {
  txId: string;
  listId: string;
  side?: "debitor" | "kreditor";
  defaultValue?: string;
  hint?: string;
  showAmount?: boolean;
  remaining?: number;
}) {
  const [state, action, pending] = useActionState(matchTransaction, empty);

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="side" value={side} />
      <input
        name="invoice_number_manual"
        list={listId}
        defaultValue={defaultValue}
        autoComplete="off"
        placeholder={hint ?? (side === "kreditor" ? "ER-Nr. / Lieferant …" : "Rg-Nr. / Kunde …")}
        style={{ width: 250, ...(defaultValue ? { borderColor: "#3a7" } : {}) }}
      />
      {showAmount && (
        <input
          name="alloc_amount"
          inputMode="decimal"
          placeholder={remaining != null ? `Betrag (Rest ${remaining.toFixed(2)})` : "Betrag"}
          style={{ width: 140 }}
        />
      )}
      <button type="submit" disabled={pending}>
        {pending ? "…" : "zuordnen"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export type LedgerAccountOption = { value: string; label: string };

/** Buchung gegen ein Sachkonto (Skonto, Durchlaufende Posten, ...) - oder,
 *  falls (noch) kein passendes Konto existiert, nur eine Notiz ohne Ziel.
 *  Optional mit angehängtem Beleg (kein voller Eingangsrechnungs-Datensatz,
 *  nur die Datei). */
export function SpecialMatchForm({
  txId,
  remaining,
  ledgerAccounts,
}: {
  txId: string;
  remaining: number;
  ledgerAccounts: LedgerAccountOption[];
}) {
  const [state, action, pending] = useActionState(matchSpecial, empty);

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <select name="ledger_account" defaultValue="" style={{ width: 220 }}>
        <option value="">— kein Sachkonto (nur Notiz) —</option>
        {ledgerAccounts.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      <input name="note" placeholder="Notiz (optional)" style={{ width: 180 }} />
      <input
        name="alloc_amount"
        inputMode="decimal"
        placeholder={`Betrag (Rest ${remaining.toFixed(2)})`}
        style={{ width: 150 }}
      />
      <input type="file" name="file" accept="application/pdf,image/*" style={{ width: 180 }} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "verbuchen"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

const emptyUpload: UploadState = {};

/** Beleg direkt aus der Bank-Detailansicht hochladen - legt eine
 *  Eingangsrechnung an, verknüpft sie sofort und verlinkt zur vollständigen
 *  Bearbeitung (Positionen/Kontierung) auf die bestehende Belegseite. */
export function BelegUploadForm({ txId, remaining }: { txId: string; remaining: number }) {
  const [state, action, pending] = useActionState(uploadBeleg, emptyUpload);

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <input type="file" name="file" accept="application/pdf,image/*" required style={{ width: 220 }} />
      <input
        name="alloc_amount"
        inputMode="decimal"
        placeholder={`Betrag (Rest ${remaining.toFixed(2)})`}
        style={{ width: 150 }}
      />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "hochladen"}
      </button>
      {state.error && <span className="msg-err">{state.error}</span>}
      {state.ok && state.docId && (
        <a
          className="ghost"
          href={`/eingangsrechnungen/${state.docId}`}
          target="_blank"
          rel="noreferrer"
          style={{ padding: "5px 10px" }}
        >
          Beleg öffnen &amp; bearbeiten →
        </a>
      )}
    </form>
  );
}
