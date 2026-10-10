"use client";

import { createContext, useActionState, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  matchTransaction,
  matchSpecial,
  uploadBeleg,
  matchMultipleIncoming,
  updateMatchNote,
  type MatchState,
  type UploadState,
  type GroupMatchState,
  matchAkonto,
} from "./actions";
import { fmtEur } from "@/lib/format";
import { AccountPicker } from "../_shared/AccountPicker";

const empty: MatchState = {};
const emptyGroup: GroupMatchState = {};
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Candidate = { number: string; label: string };

/** Eine <datalist> je Seite, von allen Zeilen per id genutzt. Wird nie geclippt. */
/**
 * Offene Rechnungen als Auswahl für das Zuordnen-Feld - einmal je Seite bereitgestellt (statt je Bankzeile),
 * die Felder lesen sie über ihre listId ("ar-list" / "er-list").
 */
const KandidatenCtx = createContext<Record<string, Candidate[]>>({});

export function KandidatenListen({ listen, children }: { listen: Record<string, Candidate[]>; children: React.ReactNode }) {
  return <KandidatenCtx.Provider value={listen}>{children}</KandidatenCtx.Provider>;
}

/**
 * Eingabefeld mit eigener Auswahlliste (statt <datalist>, dessen Breite der Browser festlegt und lange Einträge
 * abschneidet): zweizeilig - Nummer und Betrag oben, Partner und Datum darunter -, sucht nach allen Wörtern.
 */
function BelegAuswahl({
  listId,
  defaultValue,
  placeholder,
  markiert,
}: {
  listId: string;
  defaultValue?: string;
  placeholder: string;
  markiert: boolean;
}) {
  const optionen = useContext(KandidatenCtx)[listId] ?? [];
  const [wert, setWert] = useState(defaultValue ?? "");
  const [offen, setOffen] = useState(false);
  const schliessen = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treffer = useMemo(() => {
    const woerter = wert.toLowerCase().split(/\s+/).filter(Boolean);
    const passend = woerter.length ? optionen.filter((o) => woerter.every((w) => o.label.toLowerCase().includes(w))) : optionen;
    return passend.slice(0, 60);
  }, [wert, optionen]);

  return (
    <div style={{ position: "relative" }}>
      <input
        name="invoice_number_manual"
        value={wert}
        onChange={(e) => {
          setWert(e.target.value);
          setOffen(true);
        }}
        onFocus={() => setOffen(true)}
        onBlur={() => {
          schliessen.current = setTimeout(() => setOffen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOffen(false);
        }}
        autoComplete="off"
        placeholder={placeholder}
        title={wert}
        style={{ width: 340, ...(markiert ? { borderColor: "#3a7" } : {}) }}
      />
      {offen && treffer.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            top: "100%",
            left: 0,
            marginTop: 4,
            width: "min(760px, 92vw)",
            maxHeight: 360,
            overflowY: "auto",
            background: "var(--card, var(--bg))",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          }}
        >
          {treffer.map((o) => {
            const [nummer, ...rest] = o.label.split(" — ");
            const betrag = rest.length > 1 ? rest[rest.length - 1] : "";
            const mitte = rest.length > 1 ? rest.slice(0, -1).join(" · ") : rest.join(" · ");
            return (
              <button
                key={o.number + o.label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (schliessen.current) clearTimeout(schliessen.current);
                  setWert(o.label);
                  setOffen(false);
                }}
                className="ghost"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  borderRadius: 0,
                  padding: "6px 10px",
                  whiteSpace: "normal",
                }}
              >
                <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
                  <strong style={{ wordBreak: "break-all" }}>{nummer}</strong>
                  <span style={{ whiteSpace: "nowrap" }}>{betrag}</span>
                </div>
                <div className="count" style={{ fontSize: 12 }}>
                  {mitte}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
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
      <BelegAuswahl
        listId={listId}
        defaultValue={defaultValue}
        placeholder={hint ?? (side === "kreditor" ? "ER-Nr. / Lieferant …" : "Rg-Nr. / Kunde …")}
        markiert={!!defaultValue}
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
/** Ein-Klick: alle offenen Rechnungen einer Bestellung (Bestellnummer im Verwendungszweck, z. B. Amazon) zuordnen. */
export function QuickBestellungButton({
  txId,
  bestellnummer,
  docs,
}: {
  txId: string;
  bestellnummer: string;
  docs: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(matchMultipleIncoming, emptyGroup);
  const titel = docs.map((d) => d.label).join("\n");
  return (
    <form action={action} onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="hidden" name="tx_id" value={txId} />
      {docs.map((d) => (
        <input key={d.id} type="hidden" name="doc_ids" value={d.id} />
      ))}
      <button
        type="submit"
        className="ghost"
        disabled={pending}
        title={`Bestellung ${bestellnummer}:\n${titel}`}
        style={{ padding: "3px 8px", fontSize: 12, borderColor: "#3a7", color: "#3a7" }}
      >
        {pending ? "…" : docs.length === 1 ? `✓ ${docs[0].label}` : `✓ ${docs.length} Rechnungen der Bestellung ${bestellnummer}`}
      </button>
      {state.error && (
        <span className="msg-err" style={{ fontSize: 11 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

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
        title={`Sachkonto-Vorschlag übernehmen: ${ledgerAccount} – ${ledgerLabel}${note ? `\nBuchungstext: ${note}` : ""}`}
        style={{ padding: "3px 8px", fontSize: 12, borderColor: "#3a7", color: "#3a7" }}
      >
        {pending ? "…" : `✓ ${ledgerLabel.startsWith(ledgerAccount) ? ledgerLabel : `${ledgerAccount} – ${ledgerLabel}`}`}
      </button>
      {note && (
        <span className="count" style={{ fontSize: 11, maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={note}>
          „{note}“
        </span>
      )}
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
  textVorschlag,
}: {
  txId: string;
  remaining: number;
  ledgerAccounts: LedgerAccountOption[];
  /** Aus der BuchhaltungsButler-Historie gelernter Vorschlag für diese
   *  Gegenseite (siehe learnBankRules.ts) - vorbelegt, aber änderbar. */
  suggestion?: { ledger_account: string; sample_postingtext: string | null };
  /** Buchungstext-Vorschlag aus Gegenseite + Verwendungszweck (falls die Regel keinen Text hat) */
  textVorschlag?: string;
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
        defaultValue={suggestion?.sample_postingtext || textVorschlag || ""}
        placeholder="Buchungstext (optional)"
        maxLength={60}
        title="Buchungstext (Vorschlag, änderbar) – max. 60 Zeichen wie im DATEV-Export"
        style={{ flex: "1 1 360px", minWidth: 300 }}
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
        maxLength={60}
        title={value}
        style={{ width: 340, fontSize: 13 }}
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


/**
 * Debitor/Kreditor suchen (Name oder Nummer) und auswählen – sendet die Nummer als partner_nr.
 * Ergebnisse vom Server (/api/partner), weil es Tausende Organisationen gibt.
 */
function PartnerAuswahl({ art, vorschlag }: { art: "debitor" | "kreditor"; vorschlag?: { name: string; nummer: string } }) {
  const [text, setText] = useState(vorschlag ? `${vorschlag.nummer} – ${vorschlag.name}` : "");
  const [nummer, setNummer] = useState(vorschlag?.nummer ?? "");
  const [treffer, setTreffer] = useState<{ id: string; name: string; nummer: string }[]>([]);
  const [offen, setOffen] = useState(false);
  const schliessen = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!offen) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/partner?art=${art}&q=${encodeURIComponent(text)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTreffer(Array.isArray(d) ? d : []))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [text, offen, art]);
  return (
    <div style={{ position: "relative" }}>
      <input type="hidden" name="partner_nr" value={nummer} />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // eingetippte reine Nummer direkt übernehmen
          setNummer(/^\d+$/.test(e.target.value.trim()) ? e.target.value.trim() : "");
          setOffen(true);
        }}
        onFocus={() => setOffen(true)}
        onBlur={() => {
          schliessen.current = setTimeout(() => setOffen(false), 150);
        }}
        placeholder={art === "debitor" ? "Debitor suchen (Name oder Nr.)" : "Kreditor suchen (Name oder Nr.)"}
        autoComplete="off"
        style={{ width: 300 }}
      />
      {offen && treffer.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            top: "100%",
            left: 0,
            marginTop: 4,
            width: "min(520px, 92vw)",
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--card, var(--bg))",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          }}
        >
          {treffer.map((t) => (
            <button
              key={t.id}
              type="button"
              className="ghost"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (schliessen.current) clearTimeout(schliessen.current);
                setText(`${t.nummer} – ${t.name}`);
                setNummer(t.nummer);
                setOffen(false);
              }}
              style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid var(--border)", borderRadius: 0, padding: "6px 10px" }}
            >
              <strong style={{ minWidth: 60 }}>{t.nummer}</strong>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Akonto: Zahlung ohne Rechnung an einen Debitor (Eingang) bzw. Kreditor (Ausgang) buchen – z. B. Raten eines Kunden
 * auf bereits gestellte Rechnungen. Verrechnet wird später auf der Organisationsseite.
 */
export function AkontoForm({
  txId,
  remaining,
  eingang,
  vorschlag,
}: {
  txId: string;
  remaining: number;
  eingang: boolean;
  vorschlag?: { id: string; name: string; nummer: string };
}) {
  const [state, action, pending] = useActionState(matchAkonto, empty);
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="tx_id" value={txId} />
      <PartnerAuswahl art={eingang ? "debitor" : "kreditor"} vorschlag={vorschlag} />
      <input name="alloc_amount" inputMode="decimal" placeholder={`Betrag (Rest ${remaining.toFixed(2)})`} style={{ width: 150 }} />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Akonto buchen"}
      </button>
      <span className="count" style={{ fontSize: 12 }}>
        {vorschlag
          ? `an ${eingang ? "Debitor" : "Kreditor"} ${vorschlag.nummer} – ${vorschlag.name} (Zahlung ohne Rechnung)`
          : `Zahlung ohne Rechnung an einen ${eingang ? "Debitor" : "Kreditor"} – Nummer links eintragen`}
      </span>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
