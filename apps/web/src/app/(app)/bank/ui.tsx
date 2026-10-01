"use client";

import { useActionState, useState } from "react";
import {
  matchTransaction,
  matchSpecial,
  uploadBeleg,
  matchMultipleIncoming,
  updateMatchNote,
  type MatchState,
  type UploadState,
  type GroupMatchState,
} from "./actions";
import { fmtEur } from "@/lib/format";
import { AccountPicker } from "../_shared/AccountPicker";

const empty: MatchState = {};
const emptyGroup: GroupMatchState = {};
const r2 = (n: number) => Math.round(n * 100) / 100;

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

/** Mehrere Eingangsrechnungen auf einmal gegen eine Bankzeile buchen - für
 *  Kreditkarten-/PayPal-Sammelabrechnungen: die Bankzeile ist die Summe
 *  mehrerer Kartenbelege, keine 1:1-Zuordnung möglich. Checkbox-Liste mit
 *  laufender Summe, gleiches Muster wie die Lohnbuchungen-Sammelzuordnung. */
export function GroupMatchIncomingForm({
  txId,
  targetAmount,
  candidates,
}: {
  txId: string;
  targetAmount: number;
  candidates: { id: string; label: string; amount: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(matchMultipleIncoming, emptyGroup);

  if (!open) {
    return (
      <button
        type="button"
        className="ghost"
        onClick={() => setOpen(true)}
        style={{ padding: "3px 8px", fontSize: 12 }}
      >
        💳 Kreditkarten-/PayPal-Belege auswählen
      </button>
    );
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sum = r2(candidates.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.amount, 0));
  const diff = r2(targetAmount - sum);
  const matches = Math.abs(diff) <= 0.02;

  return (
    <form action={action} style={{ display: "block" }}>
      <input type="hidden" name="tx_id" value={txId} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="doc_ids" value={id} />
      ))}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 10,
          maxWidth: 460,
          background: "var(--bg)",
        }}
      >
        <div style={{ maxHeight: 220, overflow: "auto" }}>
          {candidates.map((c) => (
            <label
              key={c.id}
              style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "3px 0" }}
            >
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              {c.label}
            </label>
          ))}
          {!candidates.length && <p className="count">Keine offenen Kreditkarten-/PayPal-Belege.</p>}
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }} className={matches ? "msg-ok" : "count"}>
          Ausgewählt: {fmtEur(sum)} · Ziel: {fmtEur(targetAmount)} · Diff: {fmtEur(diff)}
          {matches && " · passt ✓"}
        </div>
        <div className="toolbar" style={{ gap: 8, marginTop: 8 }}>
          <button type="submit" disabled={pending || selected.size === 0} style={{ padding: "5px 10px" }}>
            {pending ? "…" : `${selected.size} Beleg${selected.size === 1 ? "" : "e"} verknüpfen`}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setOpen(false);
              setSelected(new Set());
            }}
            style={{ padding: "5px 10px" }}
          >
            Abbrechen
          </button>
          {state.error && <span className="msg-err">{state.error}</span>}
        </div>
      </div>
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

/** Wie QuickMatchButton, aber für wiederkehrende Sachkonto-Buchungen ohne
 *  Rechnung (Leasingraten, Miete, Bankgebühren, ...) - Vorschlag kommt aus
 *  der BuchhaltungsButler-Historie (bank_ledger_rule) statt aus einer
 *  Rechnungsnummer, bucht direkt gegen das gelernte Sachkonto. */
export function QuickSpecialMatchButton({
  txId,
  ledgerAccount,
  ledgerLabel,
  amount,
  note,
}: {
  txId: string;
  ledgerAccount: string;
  ledgerLabel: string;
  amount: number;
  note?: string | null;
}) {
  const [state, action, pending] = useActionState(matchSpecial, empty);

  return (
    <form
      action={action}
      onClick={(e) => e.stopPropagation()}
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="ledger_account" value={ledgerAccount} />
      <input type="hidden" name="alloc_amount" value={amount} />
      {note && <input type="hidden" name="note" value={note} />}
      <button
        type="submit"
        className="ghost"
        disabled={pending}
        title={`Sachkonto-Vorschlag übernehmen: ${ledgerAccount} – ${ledgerLabel}`}
        style={{ padding: "3px 8px", fontSize: 12, borderColor: "#3a7", color: "#3a7" }}
      >
        {pending ? "…" : `✓ ${ledgerAccount} – ${ledgerLabel}`}
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
        defaultValue={suggestion?.sample_postingtext ?? ""}
        placeholder="Buchungstext (optional)"
        title={suggestion ? "Vorschlag aus BuchhaltungsButler-Historie - änderbar" : undefined}
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

const emptyGroupMatch: GroupMatchState = {};

/** Buchungstext einer bereits verbuchten Zeile direkt inline bearbeiten -
 *  z.B. den aus der BuchhaltungsButler-Historie übernommenen Vorschlag
 *  ergänzen/korrigieren, ohne die Buchung aufheben und neu anlegen zu
 *  müssen. Speichert nur bei tatsächlicher Änderung (sonst kein Submit nötig). */
export function NoteEditForm({ matchId, note }: { matchId: string; note: string | null }) {
  const [state, action, pending] = useActionState(updateMatchNote, emptyGroupMatch);
  const [value, setValue] = useState(note ?? "");
  const changed = value !== (note ?? "");

  return (
    <form
      action={action}
      onClick={(e) => e.stopPropagation()}
      style={{ display: "flex", gap: 4, alignItems: "center" }}
    >
      <input type="hidden" name="match_id" value={matchId} />
      <input
        name="note"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buchungstext…"
        style={{ width: 180, fontSize: 13 }}
      />
      {changed && (
        <button type="submit" className="ghost" disabled={pending} style={{ padding: "2px 8px", fontSize: 12 }}>
          {pending ? "…" : "✓"}
        </button>
      )}
      {state.error && (
        <span className="msg-err" style={{ fontSize: 11 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
