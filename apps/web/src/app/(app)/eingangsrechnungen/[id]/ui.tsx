"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { saveIncoming, type SaveState } from "../actions";
import { AccountPicker } from "../../_shared/AccountPicker";
import { AuftragPicker } from "../../_shared/AuftragPicker";
import { Card } from "../../_shared/Card";
import { OrganizationLink } from "../../_shared/OrganizationLink";
import { fmtDate, fmtEur } from "@/lib/format";

const empty: SaveState = {};

type Opt = { id: string; label: string };
type AccountOpt = { value: string; label: string };

type Alloc = {
  id?: string;
  link_type: "sales_order" | "material" | "cost_center";
  order_number: string;
  material_ref: string;
  cost_center_id: string;
  amount: number | null;
  note: string;
};

type Pos = {
  id?: string;
  position: number | null;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  net_amount: number | null;
  ledger_account: string;
  tax_code_id: string;
  material_ref: string;
  /** Artikelnummer/SKU des Lieferanten. */
  supplier_sku: string;
  /** Referenz-/Kommissionstext der Position laut Beleg. */
  order_reference: string;
  /** Buchungstext für DATEV (max. 60 Zeichen), leer = Standardtext. */
  booking_text: string;
  /** Bereits separat erfasster Beleg, der diese Position erklärt (z.B.
   *  SaaS-Rechnung, die zusätzlich auf der Kreditkartenabrechnung auftaucht)
   *  - Bridge statt Doppelerfassung. */
  linked_document_id: string;
  allocations: Alloc[];
};

const numOrNull = (v: string): number | null => {
  const s = v.trim().replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

export function ReviewForm({
  doc,
  items,
  taxCodes,
  costCenters,
  ledgerAccounts,
  organizations,
  documents,
  suggestion,
  bankMatches,
  pdfUrl,
  pdfLabel,
}: {
  doc: Record<string, unknown>;
  items: Pos[];
  taxCodes: Opt[];
  costCenters: Opt[];
  ledgerAccounts: AccountOpt[];
  organizations: AccountOpt[];
  /** Andere Belege zum Verknüpfen einzelner Belegzeilen. */
  documents: AccountOpt[];
  /** Aus der BuchhaltungsButler-Historie gelernte oder von Hand gesetzte
   *  Vorkontierung für den Lieferanten (siehe /einstellungen/vorkontierung)
   *  - nur eine Vorbelegung, greift nur wenn noch kein eigenes Konto gesetzt. */
  suggestion?: {
    ledger_account: string | null;
    tax_code_id: string | null;
    payment_method: string | null;
  } | null;
  /** Bereits mit diesem Beleg verknüpfte Bankzeile (falls vorhanden). */
  bankMatches?: {
    id: string;
    amount: number;
    ledger_account: string | null;
    auto: boolean;
    tx: {
      id: string;
      booking_date: string;
      amount: number;
      counterparty_name: string | null;
      purpose: string | null;
      bank_account_id: string;
    } | null;
  }[];
  /** Signierte PDF-URL für die Vorschau rechts neben den oberen Karten. */
  pdfUrl?: string | null;
  pdfLabel?: string;
}) {
  const [state, action, pending] = useActionState(saveIncoming, empty);
  const v = (k: string) => (doc[k] == null ? "" : String(doc[k]));

  const [organizationId, setOrganizationId] = useState(v("supplier_organization_id"));
  const [payeeDiffers, setPayeeDiffers] = useState(v("payee_differs") === "true");
  // Kontierung passiert nur noch je Position - ein Beleg ohne Positionen
  // (z.B. wenn die KI-Extraktion keine Positionsliste erkannt hat) bekäme
  // sonst gar keine Stelle mehr zum Kontieren. Deshalb hier eine Position
  // aus den Dokument-Summen vorbelegen, statt "+ Position" zu erzwingen.
  const [docType, setDocType] = useState<string>(v("doc_type") || "invoice");
  const [positions, setPositions] = useState<Pos[]>(() =>
    items.length
      ? items
      : [
          {
            position: 1,
            description: "",
            quantity: null,
            unit_price: null,
            tax_rate:
              Number(doc.net_amount) > 0 && doc.tax_amount != null
                ? Math.round((Number(doc.tax_amount) / Number(doc.net_amount)) * 100)
                : 0,
            net_amount: doc.net_amount != null ? Number(doc.net_amount) : null,
            ledger_account: v("ledger_account") || suggestion?.ledger_account || "",
            tax_code_id: v("tax_code_id") || suggestion?.tax_code_id || "",
            material_ref: "",
            supplier_sku: "",
            order_reference: "",
            booking_text: "",
            linked_document_id: "",
            allocations: [],
          },
        ],
  );
  const [openPos, setOpenPos] = useState<number | null>(null);

  const orgName = organizations.find((o) => o.value === organizationId)?.label;

  const patchPos = (i: number, p: Partial<Pos>) =>
    setPositions((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));
  // Konto der geöffneten Position auf alle Positionen übernehmen (mit anderem Beleg verknüpfte bleiben unberührt).
  const applyAccountAll = (account: string) =>
    setPositions((xs) => xs.map((x) => (x.linked_document_id ? x : { ...x, ledger_account: account })));
  const addPos = () =>
    setPositions((xs) => [
      ...xs,
      {
        position: xs.length + 1,
        description: "",
        quantity: null,
        unit_price: null,
        tax_rate: null,
        net_amount: null,
        ledger_account: "",
        tax_code_id: "",
        material_ref: "",
        supplier_sku: "",
        order_reference: "",
        booking_text: "",
        linked_document_id: "",
        allocations: [],
      },
    ]);
  const delPos = (i: number) => {
    setPositions((xs) => xs.filter((_, k) => k !== i));
    setOpenPos(null);
  };

  const patchAlloc = (pi: number, ai: number, a: Partial<Alloc>) =>
    setPositions((xs) =>
      xs.map((x, k) =>
        k === pi
          ? { ...x, allocations: x.allocations.map((y, m) => (m === ai ? { ...y, ...a } : y)) }
          : x,
      ),
    );
  const addAlloc = (pi: number) =>
    setPositions((xs) =>
      xs.map((x, k) =>
        k === pi
          ? {
              ...x,
              allocations: [
                ...x.allocations,
                {
                  link_type: "sales_order",
                  order_number: "",
                  material_ref: "",
                  cost_center_id: "",
                  amount: x.net_amount ?? null,
                  note: "",
                },
              ],
            }
          : x,
      ),
    );
  const delAlloc = (pi: number, ai: number) =>
    setPositions((xs) =>
      xs.map((x, k) =>
        k === pi ? { ...x, allocations: x.allocations.filter((_, m) => m !== ai) } : x,
      ),
    );

  // Summen aus den Belegzeilen: Netto/USt/Brutto werden immer aus den Positionen berechnet (Gutschrift: positive Beträge).
  const r2c = (n: number) => Math.round(n * 100) / 100;
  const calc = (() => {
    if (!positions.length) return null;
    const byRate = new Map<number, number>();
    for (const p of positions) {
      const rate = p.tax_rate == null ? 0 : Number(p.tax_rate);
      byRate.set(rate, (byRate.get(rate) ?? 0) + Number(p.net_amount ?? 0));
    }
    let net = r2c([...byRate.values()].reduce((a, b) => a + b, 0));
    let tax = r2c([...byRate.entries()].reduce((a, [rate, n]) => a + r2c((n * rate) / 100), 0));
    const flip = net + tax < 0 && (docType === "credit_note" || docType === "invoice");
    if (flip) { net = -net; tax = -tax; }
    return { net: net.toFixed(2), tax: tax.toFixed(2), gross: r2c(net + tax).toFixed(2) };
  })();

  // Zahlart aus der zugeordneten Bankzeile ableiten, wenn am Beleg keine steht (Lastschrift/Karte/PayPal/Überweisung).
  const zahlartAusBank = (() => {
    for (const m of bankMatches ?? []) {
      if (m.ledger_account || !m.tx) continue;
      const t = `${m.tx.purpose ?? ""} ${m.tx.counterparty_name ?? ""}`.toLowerCase();
      if (/paypal/.test(t)) return "paypal";
      if (/lastschrift/.test(t)) return "direct_debit";
      if (/debitk|kreditk|kartenzahl|visa|mastercard|\bkarte\b/.test(t)) return "card";
      return "transfer";
    }
    return "";
  })();
  const zahlartVorbelegt = v("payment_method") || suggestion?.payment_method || zahlartAusBank || "";

  const F = ({
    name,
    label,
    type = "text",
    w,
  }: {
    name: string;
    label: string;
    type?: string;
    w?: number;
  }) => {
    const computed = calc && (name === "net_amount" ? calc.net : name === "tax_amount" ? calc.tax : name === "gross_amount" ? calc.gross : null);
    return (
      <div className="bd-field" style={w ? { width: w } : undefined}>
        <label className="bd-field-label" htmlFor={name}>{label}</label>
        {computed != null ? (
          <input className="bd-field-input" id={name} name={name} type={type} value={computed} readOnly
            title="aus den Belegzeilen berechnet" style={{ background: "var(--bd-line, #f1f1f1)" }} />
        ) : (
          <input className="bd-field-input" id={name} name={name} type={type} defaultValue={v(name)} />
        )}
      </div>
    );
  };

  return (
    <form action={action}>
      <input type="hidden" name="id" value={v("id")} />
      <input type="hidden" name="positions_json" value={JSON.stringify(positions)} />
      <input type="hidden" name="supplier_organization_id" value={organizationId} />
      <input type="hidden" name="payee_differs" value={payeeDiffers ? "on" : ""} />

      <div className="detail-outer">
        <div className="detail-form">
          <Card title="Lieferant / Gegenpartei">
            <F name="supplier_name" label="Name (laut Beleg)" />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <div className="bd-field" style={{ width: 300 }}>
                <label className="bd-field-label">Verknüpfte Organisation</label>
                <AccountPicker
                  value={organizationId}
                  onChange={setOrganizationId}
                  accounts={organizations}
                  placeholder="— keine Organisation verknüpft —"
                />
                {organizationId && orgName && (
                  <div style={{ marginTop: 4 }}>
                    <OrganizationLink id={organizationId} name={orgName} />
                  </div>
                )}
              </div>
              <F name="supplier_vat_id" label="USt-IdNr" w={200} />
            </div>
          </Card>

          <Card title="Zahlung">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div className="bd-field" style={{ width: 170 }}>
                <label className="bd-field-label" htmlFor="payment_method">Zahlart</label>
                <select
                  className="bd-field-input"
                  id="payment_method"
                  name="payment_method"
                  defaultValue={zahlartVorbelegt}
                >
                  <option value="">— unbekannt —</option>
                  <option value="transfer">Überweisung</option>
                  <option value="direct_debit">Lastschrift</option>
                  <option value="card">Kreditkarte</option>
                  <option value="paypal">PayPal</option>
                </select>
                {!v("payment_method") && suggestion?.payment_method && (
                  <div className="bd-hint">
                    Vorschlag aus <a href="/einstellungen/vorkontierung">Vorkontierung</a> übernommen.
                  </div>
                )}
                {!v("payment_method") && !suggestion?.payment_method && zahlartAusBank && (
                  <div className="bd-hint">Aus der zugeordneten Bankzeile abgeleitet - bitte mit „Speichern“ übernehmen.</div>
                )}
              </div>
              <div className="bd-field" style={{ width: 130 }}>
                <label className="bd-field-label" htmlFor="payment_status">Zahlstatus</label>
                <select className="bd-field-input" id="payment_status" name="payment_status" defaultValue={v("payment_status") || "open"}>
                  <option value="open">offen</option>
                  <option value="partly_paid">teilweise bezahlt</option>
                  <option value="paid">bezahlt</option>
                  <option value="overpaid">überzahlt</option>
                </select>
              </div>
              <F name="supplier_iban" label="IBAN (laut Beleg)" w={260} />
              <F name="discount_date" label="Skonto-Termin" type="date" w={150} />
              <F name="discount_percent" label="Skonto %" w={90} />
              <F name="discount_amount" label="Skonto-Betrag" w={130} />
              <F name="net_due_date" label="Netto-Termin" type="date" w={150} />
            </div>

            {(() => {
              const matches = bankMatches ?? [];
              const zahlungen = matches.filter((m) => !m.ledger_account);
              const skonti = matches.filter((m) => m.ledger_account);
              const num = (k: string) => (doc[k] == null ? 0 : Number(doc[k]));
              // Summen direkt aus den Zuordnungen (nicht aus gespeicherten Summenfeldern)
              const zahlungSumme = zahlungen.reduce((x, m) => x + Math.abs(m.amount), 0);
              const skontoSumme = skonti.reduce((x, m) => x + Math.abs(m.amount), 0);
              const offenBetrag = Math.max(0, Math.round((num("gross_amount") - zahlungSumme - skontoSumme) * 100) / 100);
              const status =
                zahlungen.length === 0 && skonti.length === 0
                  ? "open"
                  : offenBetrag > 0.005
                    ? "partly_paid"
                    : zahlungSumme + skontoSumme > num("gross_amount") + 0.005
                      ? "overpaid"
                      : "paid";
              const STATUS_LABEL: Record<string, string> = {
                open: "offen",
                partly_paid: "teilweise bezahlt",
                paid: "bezahlt",
                overpaid: "überzahlt",
              };
              return (
                <div style={{ marginTop: 12 }}>
                  <div className="bd-field-label">Bankzuordnung</div>
                  {zahlungen.length === 0 && skonti.length === 0 ? (
                    <div className="bd-hint">
                      Noch keiner Bankzeile zugeordnet
                      {num("gross_amount") ? ` - offen ${fmtEur(num("gross_amount"))}` : ""}.
                    </div>
                  ) : (
                    <>
                      <div className="bd-hint" style={{ marginBottom: 4 }}>
                        <strong>{STATUS_LABEL[status] ?? status}</strong>
                        {" · "}Brutto {fmtEur(num("gross_amount"))}
                        {" · "}bezahlt {fmtEur(zahlungSumme)}
                        {skontoSumme > 0 ? ` · Skonto ${fmtEur(skontoSumme)}` : ""}
                        {" · "}offen {fmtEur(offenBetrag)}
                      </div>
                      {zahlungen.map((m) => (
                        <div key={m.id} className="bd-hint" style={{ margin: "2px 0" }}>
                          {m.tx ? (
                            <Link className="bd-link" style={{ margin: 0 }} href={`/bank?account=${m.tx.bank_account_id}`}>
                              {fmtDate(m.tx.booking_date)} · {fmtEur(Math.abs(m.tx.amount))} · {m.tx.counterparty_name ?? "–"}
                            </Link>
                          ) : (
                            "Bankzeile nicht mehr vorhanden"
                          )}
                          {" - zugeordnet "}
                          {fmtEur(Math.abs(m.amount))}
                          {m.auto ? " (automatisch)" : " (von Hand)"}
                          {m.tx?.purpose ? <span className="bd-sub"> · {m.tx.purpose.slice(0, 70)}</span> : null}
                        </div>
                      ))}
                      {skonti.map((m) => (
                        <div key={m.id} className="bd-hint" style={{ margin: "2px 0" }}>
                          {`Skonto ausgebucht: ${fmtEur(Math.abs(m.amount))} (Konto ${m.ledger_account})`}
                          {m.tx ? ` - zur Zahlung vom ${fmtDate(m.tx.booking_date)}` : ""}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })()}

            <label className="bd-check">
              <input
                type="checkbox"
                checked={payeeDiffers}
                onChange={(e) => setPayeeDiffers(e.target.checked)}
              />
              Zahlung geht an einen abweichenden Empfänger (Insolvenzverwalter, Factoring, Inkasso, Abtretung …)
            </label>
            {payeeDiffers && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                <F name="payee_name" label="Empfänger" w={240} />
                <F name="payee_iban" label="IBAN Empfänger" w={260} />
                <F name="payee_reason" label="Grund" w={200} />
              </div>
            )}
          </Card>

          <Card title="Beleginformationen">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div className="bd-field" style={{ width: 170 }}>
                <label className="bd-field-label" htmlFor="doc_type">Art</label>
                <select
                  className="bd-field-input"
                  id="doc_type"
                  name="doc_type"
                  defaultValue={v("doc_type") || "invoice"}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  <option value="invoice">Rechnung</option>
                  <option value="credit_note">Gutschrift</option>
                  <option value="receipt">Beleg/Quittung</option>
                </select>
              </div>
              <F name="doc_number" label="Belegnummer" w={200} />
              <F name="doc_date" label="Belegdatum" type="date" w={160} />
              <F name="service_date" label="Leistungsdatum" type="date" w={160} />
              <div className="bd-field" style={{ width: 190 }}>
                <label className="bd-field-label" htmlFor="vat_period_date">Vorsteuer-Zeitraum (Datum)</label>
                <input className="bd-field-input" id="vat_period_date" name="vat_period_date" type="date" defaultValue={v("vat_period_date")} />
                <div className="bd-hint">leer = Belegdatum; sonst zählt der Beleg in der UStVA in diesem Monat (z.B. Rechnung erst später eingetroffen)</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <F name="net_amount" label="Netto (EUR)" w={140} />
              <F name="tax_amount" label="USt (EUR)" w={140} />
              <F name="gross_amount" label="Brutto (EUR)" w={140} />
              <div className="bd-field" style={{ width: 90 }}>
                <label className="bd-field-label" htmlFor="currency">Währung lt. Beleg</label>
                <input
                  className="bd-field-input"
                  id="currency"
                  name="currency"
                  defaultValue={v("currency") || "EUR"}
                  maxLength={3}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              {v("currency") && v("currency") !== "EUR" && (
                <F name="fx_gross_amount" label={`Original-Brutto (${v("currency")})`} w={160} />
              )}
            </div>
            {v("currency") && v("currency") !== "EUR" && (
              <p className="bd-hint">
                Netto/USt/Brutto sind die tatsächlich in EUR gebuchten Beträge (z.B. vom
                Kontoauszug/der Kreditkartenabrechnung) — Original-Brutto ist nur der auf dem
                Beleg selbst ausgewiesene Fremdwährungsbetrag zur Anzeige.
              </p>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            </div>
          </Card>

          {/* Kontierung (Aufwandskonto/Steuerschlüssel/Kostenstelle) passiert nur
              noch je Position (siehe Belegzeilen) - keine Dokument-Vorgabe mehr
              zum Bearbeiten. Die bisherigen Dokument-Werte bleiben als Fallback
              für Positionen ohne eigene Angabe erhalten, nur nicht mehr editierbar. */}
          <input type="hidden" name="ledger_account" value={v("ledger_account")} />
          <input type="hidden" name="tax_code_id" value={v("tax_code_id")} />
          <input type="hidden" name="cost_center_id" value={v("cost_center_id")} />
        </div>

        {pdfUrl && (
          <div className="detail-pdf">
            <div className="pdf-frame">
              <div className="pdf-toolbar">{pdfLabel ?? "Beleg.pdf"}</div>
              <iframe src={pdfUrl} title="Beleg-PDF" />
            </div>
            <a className="pdf-open-link" href={pdfUrl} target="_blank" rel="noreferrer">
              PDF in groß öffnen →
            </a>
          </div>
        )}

        <div className="bd-full">
          <Card title="Belegzeilen" style={{ padding: 0 }}>
            <div style={{ padding: "0 16px" }}>
              <div className="toolbar" style={{ justifyContent: "flex-end", padding: "12px 0 0" }}>
                <button type="button" className="bd-btn bd-btn-secondary" onClick={addPos}>+ Position</button>
              </div>
            </div>
            {positions.length === 0 ? (
              <p className="lead" style={{ padding: "0 16px 16px" }}>Keine Positionen. „+ Position" zum Anlegen.</p>
            ) : (
              <div>
                {positions.map((p, pi) => {
                  const lines = (p.description || "").split("\n").map((x) => x.trim()).filter(Boolean);
                  const [title, ...rest] = lines;
                  const auftrag = p.allocations
                    .filter((a) => a.link_type === "sales_order" && a.order_number)
                    .map((a) => a.order_number)
                    .join(", ");
                  const ust = p.tax_code_id ? (taxCodes.find((t) => t.id === p.tax_code_id)?.label.split(" – ")[0] ?? "?") : null;
                  const chip = (text: string, warn = false) => (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 8px",
                        borderRadius: 10,
                        fontSize: 12,
                        background: warn ? "rgba(217,142,4,.15)" : "var(--bd-line, #eee)",
                        color: warn ? "#a86800" : "inherit",
                      }}
                    >
                      {text}
                    </span>
                  );
                  return (
                    <div
                      key={pi}
                      onClick={() => setOpenPos(pi)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "34px minmax(0,1fr) auto",
                        gap: 12,
                        padding: "12px 16px",
                        borderTop: "1px solid var(--bd-line, #e5e5e5)",
                        cursor: "pointer",
                      }}
                    >
                      <div className="bd-sub" style={{ paddingTop: 1 }}>{p.position ?? pi + 1}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{title || "(ohne Text)"}</div>
                        {p.booking_text && (
                          <div className="bd-sub" style={{ marginTop: 2 }}>Buchungstext: {p.booking_text}</div>
                        )}
                        {rest.length > 0 && (
                          <div className="bd-sub" style={{ marginTop: 2, whiteSpace: "pre-line", lineHeight: 1.45 }}>
                            {rest.join("\n")}
                          </div>
                        )}
                        {(p.supplier_sku || auftrag || p.order_reference || p.linked_document_id) && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                            {p.supplier_sku && chip(`Art.-Nr. ${p.supplier_sku}`)}
                            {auftrag && chip(`Auftrag ${auftrag}`)}
                            {p.order_reference && chip(`Ref. ${p.order_reference}`)}
                            {p.linked_document_id && chip("🔗 mit anderem Beleg verknüpft")}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>{p.net_amount != null ? fmtEur(p.net_amount) : "–"}</div>
                        {p.unit_price != null && (
                          <div className="bd-sub">
                            {p.quantity != null ? p.quantity : "–"} × {p.unit_price != null ? fmtEur(p.unit_price) : "–"}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                          {!p.linked_document_id && chip(p.ledger_account ? `Konto ${p.ledger_account}` : "Konto (Vorgabe)")}
                          {!p.linked_document_id && (ust ? chip(ust) : chip("USt fehlt", true))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(() => {
              // Steuer nach Sätzen: Netto je Satz aus den Belegzeilen, Abgleich mit den Kopfwerten.
              const eligible = positions.filter((p) => !p.linked_document_id && p.net_amount != null);
              if (eligible.length === 0) return null;
              const groups = new Map<string, { rate: number | null; net: number; codes: Set<string> }>();
              for (const p of eligible) {
                const key = p.tax_rate == null ? "?" : String(Math.round(Number(p.tax_rate) * 100) / 100);
                const g = groups.get(key) ?? { rate: p.tax_rate == null ? null : Number(p.tax_rate), net: 0, codes: new Set<string>() };
                g.net += Number(p.net_amount);
                g.codes.add(p.tax_code_id ? (taxCodes.find((t) => t.id === p.tax_code_id)?.label.split(" – ")[0] ?? "?") : "fehlt");
                groups.set(key, g);
              }
              const rows = [...groups.values()].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
              const r2 = (x: number) => Math.round(x * 100) / 100;
              const sumNet = r2(rows.reduce((s, g) => s + g.net, 0));
              const sumTax = r2(rows.reduce((s, g) => s + r2((g.net * (g.rate ?? 0)) / 100), 0));
              const hdrNet = doc.net_amount == null ? null : Number(doc.net_amount);
              const hdrTax = doc.tax_amount == null ? null : Number(doc.tax_amount);
              const netOk = hdrNet == null || Math.abs(sumNet - hdrNet) <= 0.05;
              const taxOk = hdrTax == null || Math.abs(sumTax - hdrTax) <= 0.05;
              return (
                <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--bd-line, #e5e5e5)" }}>
                  <div className="bd-field-label" style={{ marginBottom: 6 }}>Steuer nach Sätzen</div>
                  <table className="bd-table" style={{ maxWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>Satz</th>
                        <th className="bd-num">Netto</th>
                        <th className="bd-num">USt</th>
                        <th>Steuerschlüssel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((g, i) => (
                        <tr key={i}>
                          <td>{g.rate == null ? "?" : `${g.rate} %`}</td>
                          <td className="bd-num">{fmtEur(r2(g.net))}</td>
                          <td className="bd-num">{fmtEur(r2((g.net * (g.rate ?? 0)) / 100))}</td>
                          <td className="bd-sub">{[...g.codes].join(", ")}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 600 }}>
                        <td>Summe</td>
                        <td className="bd-num">{fmtEur(sumNet)}</td>
                        <td className="bd-num">{fmtEur(sumTax)}</td>
                        <td className="bd-sub">Brutto {fmtEur(r2(sumNet + sumTax))}</td>
                      </tr>
                    </tbody>
                  </table>
                  {(!netOk || !taxOk) && (
                    <p className="bd-hint" style={{ color: "#a86800", marginTop: 6 }}>
                      Weicht vom Beleg ab: Netto {fmtEur(hdrNet ?? 0)} / USt {fmtEur(hdrTax ?? 0)} laut Kopfdaten.
                    </p>
                  )}
                </div>
              );
            })()}
          </Card>
        </div>
      </div>

      {openPos != null && positions[openPos] && (
        <PositionModal
          pos={positions[openPos]}
          onClose={() => setOpenPos(null)}
          onPatch={(p) => patchPos(openPos, p)}
          onApplyAccountAll={applyAccountAll}
          positionCount={positions.filter((x) => !x.linked_document_id).length}
          onDelete={() => delPos(openPos)}
          onAddAlloc={() => addAlloc(openPos)}
          onPatchAlloc={(ai, a) => patchAlloc(openPos, ai, a)}
          onDelAlloc={(ai) => delAlloc(openPos, ai)}
          taxCodes={taxCodes}
          costCenters={costCenters}
          ledgerAccounts={ledgerAccounts}
          documents={documents}
        />
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <button className="bd-btn bd-btn-primary" type="submit" disabled={pending}>
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {state.ok && <span className="msg-ok">✓ gespeichert{state.note ? ` — ${state.note}` : ""}</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}

/** Restliche Positionsfelder (Steuerschlüssel, Material-Referenz, Aufteilung)
 *  im Modal - die Liste zeigt nur die wichtigsten Spalten, der Rest wird
 *  erst bei Bedarf (Klick auf die Zeile) sichtbar. Sachkonto hier mit
 *  derselben Suchfunktion wie überall sonst (AccountPicker). */
function PositionModal({
  pos,
  onClose,
  onPatch,
  onApplyAccountAll,
  positionCount,
  onDelete,
  onAddAlloc,
  onPatchAlloc,
  onDelAlloc,
  taxCodes,
  costCenters,
  ledgerAccounts,
  documents,
}: {
  pos: Pos;
  onClose: () => void;
  onPatch: (p: Partial<Pos>) => void;
  onApplyAccountAll: (account: string) => void;
  positionCount: number;
  onDelete: () => void;
  onAddAlloc: () => void;
  onPatchAlloc: (ai: number, a: Partial<Alloc>) => void;
  onDelAlloc: (ai: number) => void;
  taxCodes: Opt[];
  costCenters: Opt[];
  ledgerAccounts: AccountOpt[];
  documents: AccountOpt[];
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allocSum = pos.allocations.reduce((s, a) => s + (a.amount ?? 0), 0);
  const mismatch =
    pos.allocations.length > 0 && pos.net_amount != null && Math.abs(allocSum - pos.net_amount) > 0.01;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "6vh 3vw",
        overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bd-card"
        style={{
          margin: 0,
          padding: 0,
          width: "min(760px, 96vw)",
          maxHeight: "88vh",
          overflow: "auto",
        }}
      >
        <div
          className="toolbar"
          style={{ justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--bd-line)" }}
        >
          <strong style={{ fontFamily: "var(--font-bd-display)" }}>Position {pos.position ?? ""}</strong>
          <div className="toolbar" style={{ gap: 8 }}>
            <button type="button" className="bd-btn bd-btn-secondary" onClick={onDelete}>Position löschen</button>
            <button type="button" className="bd-btn bd-btn-secondary" onClick={onClose}>Schließen</button>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <div className="bd-field">
            <label className="bd-field-label">Beschreibung (kompletter Positionstext)</label>
            <textarea
              className="bd-field-input"
              rows={Math.min(14, Math.max(3, pos.description.split("\n").length + 1))}
              value={pos.description}
              onChange={(e) => onPatch({ description: e.target.value })}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div className="bd-field" style={{ width: 200 }}>
              <label className="bd-field-label">Artikelnr./SKU (Lieferant)</label>
              <input className="bd-field-input" value={pos.supplier_sku} onChange={(e) => onPatch({ supplier_sku: e.target.value })} />
            </div>
            <div className="bd-field" style={{ flex: "1 1 240px" }}>
              <label className="bd-field-label">Referenz laut Beleg</label>
              <input className="bd-field-input" value={pos.order_reference} onChange={(e) => onPatch({ order_reference: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div className="bd-field" style={{ width: 90 }}>
              <label className="bd-field-label">Menge</label>
              <input className="bd-field-input" value={pos.quantity ?? ""} onChange={(e) => onPatch({ quantity: numOrNull(e.target.value) })} />
            </div>
            <div className="bd-field" style={{ width: 110 }}>
              <label className="bd-field-label">Einzelpreis</label>
              <input className="bd-field-input" value={pos.unit_price ?? ""} onChange={(e) => onPatch({ unit_price: numOrNull(e.target.value) })} />
            </div>
            <div className="bd-field" style={{ width: 80 }}>
              <label className="bd-field-label">USt %</label>
              <input className="bd-field-input" value={pos.tax_rate ?? ""} onChange={(e) => onPatch({ tax_rate: numOrNull(e.target.value) })} />
            </div>
            <div className="bd-field" style={{ width: 120 }}>
              <label className="bd-field-label">Netto</label>
              <input className="bd-field-input" value={pos.net_amount ?? ""} onChange={(e) => onPatch({ net_amount: numOrNull(e.target.value) })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div className="bd-field" style={{ width: 280 }}>
              <label className="bd-field-label">Konto (überschreibt Vorgabe)</label>
              <AccountPicker
                value={pos.ledger_account}
                onChange={(val) => onPatch({ ledger_account: val })}
                accounts={ledgerAccounts}
                placeholder="(Vorgabe)"
              />
              {positionCount > 1 && (
                <button
                  type="button"
                  className="bd-btn bd-btn-secondary"
                  style={{ marginTop: 6, fontSize: 12, padding: "3px 10px" }}
                  disabled={!pos.ledger_account}
                  onClick={() => onApplyAccountAll(pos.ledger_account)}
                  title="Setzt dieses Konto bei allen Positionen (ohne verknüpften Beleg); danach noch speichern"
                >
                  dieses Konto auf alle {positionCount} Positionen anwenden
                </button>
              )}
            </div>
            <div className="bd-field" style={{ width: 200 }}>
              <label className="bd-field-label">Steuerschlüssel</label>
              <select className="bd-field-input" value={pos.tax_code_id} onChange={(e) => onPatch({ tax_code_id: e.target.value })}>
                <option value="">(Vorgabe)</option>
                {taxCodes.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="bd-field" style={{ width: 160 }}>
              <label className="bd-field-label">Material-Referenz</label>
              <input className="bd-field-input" value={pos.material_ref} onChange={(e) => onPatch({ material_ref: e.target.value })} />
            </div>
          </div>

          <div className="bd-field" style={{ marginTop: 10 }}>
            <label className="bd-field-label">Buchungstext (für DATEV, max. 60 Zeichen - leer = „ER Belegnr. Lieferant“)</label>
            <input
              className="bd-field-input"
              maxLength={60}
              value={pos.booking_text}
              placeholder="z.B. Tanken Dienstwagen / Horizon StitchLiner"
              onChange={(e) => onPatch({ booking_text: e.target.value })}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <div className="bd-field" style={{ width: 340 }}>
              <label className="bd-field-label">Verknüpfter Beleg (bereits separat erfasst)</label>
              <AccountPicker
                value={pos.linked_document_id}
                onChange={(val) => onPatch({ linked_document_id: val })}
                accounts={documents}
                placeholder="— kein verknüpfter Beleg —"
                title="Beleg verknüpfen"
                searchPlaceholder="Belegnummer oder Lieferant suchen…"
                emptyOptionLabel="— kein verknüpfter Beleg —"
              />
            </div>
            {pos.linked_document_id && (
              <>
                <a
                  className="bd-link"
                  style={{ marginTop: 4 }}
                  href={`/eingangsrechnungen/${pos.linked_document_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  verknüpften Beleg öffnen →
                </a>
                <div className="bd-hint">
                  Diese Position wird für DATEV/Buchung nicht separat gezählt (Sachkonto hier ohne
                  Wirkung) - die Buchung läuft über den verknüpften Beleg.
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px dashed var(--bd-line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontFamily: "var(--font-bd-display)" }}>Aufteilung</strong>
              <button type="button" className="bd-btn bd-btn-secondary" onClick={onAddAlloc}>+ Zuordnung</button>
            </div>
            {mismatch && (
              <p className="msg-err" style={{ margin: "4px 0" }}>
                Summe Aufteilung {allocSum.toFixed(2)} ≠ Netto {pos.net_amount?.toFixed(2)}
              </p>
            )}
            {pos.allocations.map((a, ai) => (
              <div
                key={ai}
                style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}
              >
                <div className="bd-field" style={{ width: 140 }}>
                  <label className="bd-field-label">Ziel</label>
                  <select
                    className="bd-field-input"
                    value={a.link_type}
                    onChange={(e) => onPatchAlloc(ai, { link_type: e.target.value as Alloc["link_type"] })}
                  >
                    <option value="sales_order">Auftrag</option>
                    <option value="material">Material</option>
                    <option value="cost_center">Kostenstelle</option>
                  </select>
                </div>
                {a.link_type === "sales_order" && (
                  <div className="bd-field" style={{ width: 200 }}>
                    <label className="bd-field-label">Auftrag</label>
                    <AuftragPicker value={a.order_number} onChange={(val) => onPatchAlloc(ai, { order_number: val })} />
                  </div>
                )}
                {a.link_type === "material" && (
                  <div className="bd-field" style={{ width: 200 }}>
                    <label className="bd-field-label">Material-Referenz</label>
                    <input className="bd-field-input" value={a.material_ref} onChange={(e) => onPatchAlloc(ai, { material_ref: e.target.value })} />
                  </div>
                )}
                {a.link_type === "cost_center" && (
                  <div className="bd-field" style={{ width: 200 }}>
                    <label className="bd-field-label">Kostenstelle</label>
                    <select className="bd-field-input" value={a.cost_center_id} onChange={(e) => onPatchAlloc(ai, { cost_center_id: e.target.value })}>
                      <option value="">–</option>
                      {costCenters.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="bd-field" style={{ width: 110 }}>
                  <label className="bd-field-label">Betrag (netto)</label>
                  <input className="bd-field-input" value={a.amount ?? ""} onChange={(e) => onPatchAlloc(ai, { amount: numOrNull(e.target.value) })} />
                </div>
                <div className="bd-field" style={{ flex: "1 1 120px" }}>
                  <label className="bd-field-label">Notiz</label>
                  <input className="bd-field-input" value={a.note} onChange={(e) => onPatchAlloc(ai, { note: e.target.value })} />
                </div>
                <button type="button" className="bd-btn bd-btn-secondary" onClick={() => onDelAlloc(ai)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
