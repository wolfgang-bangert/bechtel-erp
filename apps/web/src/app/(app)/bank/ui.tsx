"use client";

import { useActionState, useState } from "react";
import { matchTransaction, matchSpecial, uploadBeleg, type MatchState, type UploadState } from "./actions";
import { AccountPicker } from "../_shared/AccountPicker";

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

/** Ein-Klick-Zuordnung direkt in der Bank-Liste für den Fall, dass der
 *  Betrag eindeutig genau eine offene Rechnung trifft (derselbe Vorschlag,
 *  der sonst nur als Autocomplete im Detail-Popup steckt) - erspart das
 *  Öffnen des Popups beim schnellen Durchklicken mehrerer Umsätze.
 *  stopPropagation, damit der Klick nicht zusätzlich die Zeile (Popup)
 *  öffnet, die Zeile selbst hat einen eigenen onClick. */
export function QuickMatchButton({
  txId,
  side,
  suggestion,
}: {
  txId: string;
  side: "debitor" | "kreditor";
  suggestion: string;
}) {
  const [state, action, pending] = useActionState(matchTransaction, empty);

  return (
    <form
      action={action}
      onClick={(e) => e.stopPropagation()}
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="invoice_number_manual" value={suggestion} />
      <button
        type="submit"
        className="ghost"
        disabled={pending}
        title={`Vorschlag übernehmen: ${suggestion}`}
        style={{ padding: "3px 8px", fontSize: 12, borderColor: "#3a7", color: "#3a7" }}
      >
        {pending ? "…" : `✓ ${suggestion}`}
      </button>
      {state.error && (
        <span className="msg-err" style={{ fontSize: 11 }}>
          {state.error}
        </span>
      )}
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
  suggestion,
}: {
  txId: string;
  remaining: number;
  ledgerAccounts: LedgerAccountOption[];
  /** Aus der BuchhaltungsButler-Historie gelernter Vorschlag für diese
   *  Gegenseite (siehe learnBankRules.ts) - vorbelegt, aber änderbar. */
  suggestion?: { ledger_account: string; sample_postingtext: string | null };
}) {
  const [state, action, pending] = useActionState(matchSpecial, empty);
  const [ledgerAccount, setLedgerAccount] = useState(suggestion?.ledger_account ?? "");

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <div style={{ width: 220 }} title={suggestion ? "Vorschlag aus BuchhaltungsButler-Historie" : undefined}>
        <AccountPicker
          name="ledger_account"
          value={ledgerAccount}
          onChange={setLedgerAccount}
          accounts={ledgerAccounts}
          placeholder="— kein Sachkonto (nur Notiz) —"
        />
      </div>
      <input
        name="note"
        placeholder={suggestion?.sample_postingtext ?? "Notiz (optional)"}
        style={{ width: 180 }}
      />
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
