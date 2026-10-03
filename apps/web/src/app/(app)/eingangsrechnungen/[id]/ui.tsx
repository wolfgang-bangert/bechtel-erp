"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { saveIncoming, type SaveState } from "../actions";
import { AccountPicker } from "../../_shared/AccountPicker";
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
  bankTx,
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
  bankTx?: { id: string; booking_date: string; amount: number; counterparty_name: string | null; bank_account_id: string } | null;
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
            linked_document_id: "",
            allocations: [],
          },
        ],
  );
  const [openPos, setOpenPos] = useState<number | null>(null);

  const orgName = organizations.find((o) => o.value === organizationId)?.label;

  const patchPos = (i: number, p: Partial<Pos>) =>
    setPositions((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));
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
  }) => (
    <div className="bd-field" style={w ? { width: w } : undefined}>
      <label className="bd-field-label" htmlFor={name}>{label}</label>
      <input className="bd-field-input" id={name} name={name} type={type} defaultValue={v(name)} />
    </div>
  );

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
                  defaultValue={v("payment_method") || suggestion?.payment_method || ""}
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
              </div>
              <F name="supplier_iban" label="IBAN (laut Beleg)" w={260} />
              <F name="discount_date" label="Skonto-Termin" type="date" w={150} />
              <F name="discount_percent" label="Skonto %" w={90} />
              <F name="discount_amount" label="Skonto-Betrag" w={130} />
              <F name="net_due_date" label="Netto-Termin" type="date" w={150} />
            </div>

            {bankTx && (
              <div className="bd-hint">
                Verknüpfte Bankzeile:{" "}
                <Link className="bd-link" style={{ margin: 0 }} href={`/bank?account=${bankTx.bank_account_id}`}>
                  {fmtDate(bankTx.booking_date)} · {fmtEur(bankTx.amount)} · {bankTx.counterparty_name ?? "–"}
                </Link>
              </div>
            )}

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
                >
                  <option value="invoice">Rechnung</option>
                  <option value="credit_note">Gutschrift</option>
                  <option value="receipt">Beleg/Quittung</option>
                </select>
              </div>
              <F name="doc_number" label="Belegnummer" w={200} />
              <F name="doc_date" label="Belegdatum" type="date" w={160} />
              <F name="service_date" label="Leistungsdatum" type="date" w={160} />
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
              <div className="bd-field" style={{ width: 160 }}>
                <label className="bd-field-label" htmlFor="payment_status">Zahlstatus</label>
                <select className="bd-field-input" id="payment_status" name="payment_status" defaultValue={v("payment_status") || "open"}>
                  <option value="open">offen</option>
                  <option value="paid">bezahlt</option>
                </select>
              </div>
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
              <div className="table-scroll">
                <table className="bd-table">
                  <thead>
                    <tr>
                      <th>Pos.</th>
                      <th>Art.-Nr.</th>
                      <th>Beschreibung</th>
                      <th>Auftrag</th>
                      <th className="bd-num">Menge</th>
                      <th className="bd-num">Einzelpreis</th>
                      <th className="bd-num">Netto</th>
                      <th>Konto</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p, pi) => (
                      <tr key={pi} onClick={() => setOpenPos(pi)} style={{ cursor: "pointer" }}>
                        <td className="bd-sub">{p.position ?? pi + 1}</td>
                        <td className="bd-sub">{p.supplier_sku || "–"}</td>
                        <td className="wrap" style={{ whiteSpace: "pre-line" }}>{p.description || "–"}</td>
                        <td className="wrap bd-sub">
                          {p.allocations
                            .filter((a) => a.link_type === "sales_order" && a.order_number)
                            .map((a) => a.order_number)
                            .join(", ") || "–"}
                        </td>
                        <td className="bd-num">{p.quantity ?? "–"}</td>
                        <td className="bd-num">{p.unit_price != null ? fmtEur(p.unit_price) : "–"}</td>
                        <td className="bd-num">{p.net_amount != null ? fmtEur(p.net_amount) : "–"}</td>
                        <td className="bd-sub">
                          {p.linked_document_id ? "– (verknüpft)" : p.ledger_account || "(Vorgabe)"}
                        </td>
                        <td className="bd-sub">
                          {p.linked_document_id && (
                            <span title="Mit einem anderen Beleg verknüpft - wird nicht separat gebucht">🔗</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {openPos != null && positions[openPos] && (
        <PositionModal
          pos={positions[openPos]}
          onClose={() => setOpenPos(null)}
          onPatch={(p) => patchPos(openPos, p)}
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
                  <div className="bd-field" style={{ width: 160 }}>
                    <label className="bd-field-label">Auftragsnummer / Referenz</label>
                    <input className="bd-field-input" value={a.order_number} onChange={(e) => onPatchAlloc(ai, { order_number: e.target.value })} />
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
