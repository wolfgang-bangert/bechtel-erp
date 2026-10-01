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
  suggestion,
  bankTx,
}: {
  doc: Record<string, unknown>;
  items: Pos[];
  taxCodes: Opt[];
  costCenters: Opt[];
  ledgerAccounts: AccountOpt[];
  organizations: AccountOpt[];
  /** Aus der BuchhaltungsButler-Historie gelernte oder von Hand gesetzte
   *  Vorkontierung für den Lieferanten (siehe /einstellungen/vorkontierung)
   *  - nur eine Vorbelegung, greift nur wenn noch kein eigenes Konto gesetzt. */
  suggestion?: { ledger_account: string; tax_code_id: string | null } | null;
  /** Bereits mit diesem Beleg verknüpfte Bankzeile (falls vorhanden). */
  bankTx?: { id: string; booking_date: string; amount: number; counterparty_name: string | null; bank_account_id: string } | null;
}) {
  const [state, action, pending] = useActionState(saveIncoming, empty);
  const v = (k: string) => (doc[k] == null ? "" : String(doc[k]));

  const usingSuggestion = !v("ledger_account") && !!suggestion?.ledger_account;
  const [defaultLedgerAccount, setDefaultLedgerAccount] = useState(
    v("ledger_account") || suggestion?.ledger_account || "",
  );
  const [organizationId, setOrganizationId] = useState(v("supplier_organization_id"));
  const [payeeDiffers, setPayeeDiffers] = useState(v("payee_differs") === "true");
  const [positions, setPositions] = useState<Pos[]>(items);
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
    <div className="field" style={w ? { width: w } : undefined}>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={v(name)} />
    </div>
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={v("id")} />
      <input type="hidden" name="positions_json" value={JSON.stringify(positions)} />
      <input type="hidden" name="supplier_organization_id" value={organizationId} />
      <input type="hidden" name="payee_differs" value={payeeDiffers ? "on" : ""} />

      <Card title="Lieferant / Gegenpartei">
        <F name="supplier_name" label="Name (laut Beleg)" />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <div className="field" style={{ width: 300 }}>
            <label>Verknüpfte Organisation</label>
            <AccountPicker
              value={organizationId}
              onChange={setOrganizationId}
              accounts={organizations}
              placeholder="— keine Organisation verknüpft —"
            />
            {organizationId && orgName && (
              <div style={{ marginTop: 4, fontSize: 13 }}>
                <OrganizationLink id={organizationId} name={orgName} />
              </div>
            )}
          </div>
          <F name="supplier_vat_id" label="USt-IdNr" w={200} />
        </div>
      </Card>

      <Card title="Zahlung">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ width: 150 }}>
            <label htmlFor="payment_method">Zahlart</label>
            <select id="payment_method" name="payment_method" defaultValue={v("payment_method") || ""}>
              <option value="">Überweisung/Lastschrift</option>
              <option value="card">Kreditkarte</option>
              <option value="paypal">PayPal</option>
            </select>
          </div>
          <F name="supplier_iban" label="IBAN (laut Beleg)" w={260} />
          <F name="discount_date" label="Skonto-Termin" type="date" w={150} />
          <F name="discount_percent" label="Skonto %" w={90} />
          <F name="discount_amount" label="Skonto-Betrag" w={130} />
          <F name="net_due_date" label="Netto-Termin" type="date" w={150} />
        </div>

        {bankTx && (
          <p className="lead" style={{ marginTop: 10, marginBottom: 0 }}>
            Verknüpfte Bankzeile:{" "}
            <Link href={`/bank?account=${bankTx.bank_account_id}`}>
              {fmtDate(bankTx.booking_date)} · {fmtEur(bankTx.amount)} · {bankTx.counterparty_name ?? "–"}
            </Link>
          </p>
        )}

        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
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
          <div className="field" style={{ width: 150 }}>
            <label htmlFor="doc_type">Art</label>
            <select id="doc_type" name="doc_type" defaultValue={v("doc_type") || "invoice"}>
              <option value="invoice">Rechnung</option>
              <option value="credit_note">Gutschrift</option>
              <option value="receipt">Beleg/Quittung</option>
            </select>
          </div>
          <F name="doc_number" label="Belegnummer" w={200} />
          <F name="doc_date" label="Belegdatum" type="date" w={160} />
          <F name="service_date" label="Leistungsdatum" type="date" w={160} />
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          <F name="net_amount" label="Netto" w={140} />
          <F name="tax_amount" label="USt" w={140} />
          <F name="gross_amount" label="Brutto" w={140} />
        </div>
      </Card>

      <Card title="Kontierung (Vorgabe)">
        <p className="lead" style={{ marginTop: -6 }}>
          Gilt für alle Positionen ohne eigene Angabe.
          {usingSuggestion && (
            <>
              {" "}
              <span className="msg-ok">
                Vorschlag aus <a href="/einstellungen/vorkontierung">Vorkontierung</a> übernommen — prüfen
                und speichern.
              </span>
            </>
          )}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ width: 300 }}>
            <label>Aufwandskonto (SKR03)</label>
            <AccountPicker
              name="ledger_account"
              value={defaultLedgerAccount}
              onChange={setDefaultLedgerAccount}
              accounts={ledgerAccounts}
            />
          </div>
          <div className="field" style={{ width: 220 }}>
            <label htmlFor="tax_code_id">Steuerschlüssel</label>
            <select
              id="tax_code_id"
              name="tax_code_id"
              defaultValue={v("tax_code_id") || suggestion?.tax_code_id || ""}
            >
              <option value="">–</option>
              {taxCodes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 220 }}>
            <label htmlFor="cost_center_id">Kostenstelle</label>
            <select id="cost_center_id" name="cost_center_id" defaultValue={v("cost_center_id")}>
              <option value="">–</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 160 }}>
            <label htmlFor="payment_status">Zahlstatus</label>
            <select id="payment_status" name="payment_status" defaultValue={v("payment_status") || "open"}>
              <option value="open">offen</option>
              <option value="paid">bezahlt</option>
            </select>
          </div>
        </div>
      </Card>

      <Card
        title="Belegzeilen"
        style={{ padding: 0 }}
      >
        <div style={{ padding: "0 16px" }}>
          <div className="toolbar" style={{ justifyContent: "flex-end", padding: "12px 0 0" }}>
            <button type="button" className="ghost" onClick={addPos}>+ Position</button>
          </div>
        </div>
        {positions.length === 0 ? (
          <p className="lead" style={{ padding: "0 16px 16px" }}>Keine Positionen. „+ Position" zum Anlegen.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Beschreibung</th>
                  <th style={{ textAlign: "right" }}>Menge</th>
                  <th style={{ textAlign: "right" }}>Einzelpreis</th>
                  <th style={{ textAlign: "right" }}>Netto</th>
                  <th>Konto</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p, pi) => (
                  <tr key={pi} onClick={() => setOpenPos(pi)} style={{ cursor: "pointer" }}>
                    <td className="count">{p.position ?? pi + 1}</td>
                    <td className="wrap">{p.description || "–"}</td>
                    <td style={{ textAlign: "right" }}>{p.quantity ?? "–"}</td>
                    <td style={{ textAlign: "right" }}>{p.unit_price != null ? fmtEur(p.unit_price) : "–"}</td>
                    <td style={{ textAlign: "right" }}>{p.net_amount != null ? fmtEur(p.net_amount) : "–"}</td>
                    <td className="count">{p.ledger_account || "(Vorgabe)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
        />
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <button type="submit" disabled={pending}>
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
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          width: "min(760px, 96vw)",
          maxHeight: "88vh",
          overflow: "auto",
        }}
      >
        <div
          className="toolbar"
          style={{ justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}
        >
          <strong>Position {pos.position ?? ""}</strong>
          <div className="toolbar" style={{ gap: 8 }}>
            <button type="button" className="ghost" onClick={onDelete}>Position löschen</button>
            <button type="button" onClick={onClose} style={{ padding: "5px 10px" }}>Schließen</button>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <div className="field">
            <label>Beschreibung</label>
            <input value={pos.description} onChange={(e) => onPatch({ description: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div className="field" style={{ width: 90 }}>
              <label>Menge</label>
              <input value={pos.quantity ?? ""} onChange={(e) => onPatch({ quantity: numOrNull(e.target.value) })} />
            </div>
            <div className="field" style={{ width: 110 }}>
              <label>Einzelpreis</label>
              <input value={pos.unit_price ?? ""} onChange={(e) => onPatch({ unit_price: numOrNull(e.target.value) })} />
            </div>
            <div className="field" style={{ width: 80 }}>
              <label>USt %</label>
              <input value={pos.tax_rate ?? ""} onChange={(e) => onPatch({ tax_rate: numOrNull(e.target.value) })} />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label>Netto</label>
              <input value={pos.net_amount ?? ""} onChange={(e) => onPatch({ net_amount: numOrNull(e.target.value) })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div className="field" style={{ width: 280 }}>
              <label>Konto (überschreibt Vorgabe)</label>
              <AccountPicker
                value={pos.ledger_account}
                onChange={(val) => onPatch({ ledger_account: val })}
                accounts={ledgerAccounts}
                placeholder="(Vorgabe)"
              />
            </div>
            <div className="field" style={{ width: 200 }}>
              <label>Steuerschlüssel</label>
              <select value={pos.tax_code_id} onChange={(e) => onPatch({ tax_code_id: e.target.value })}>
                <option value="">(Vorgabe)</option>
                {taxCodes.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 160 }}>
              <label>Material-Referenz</label>
              <input value={pos.material_ref} onChange={(e) => onPatch({ material_ref: e.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Aufteilung</strong>
              <button type="button" className="ghost" onClick={onAddAlloc}>+ Zuordnung</button>
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
                <div className="field" style={{ width: 140 }}>
                  <label>Ziel</label>
                  <select
                    value={a.link_type}
                    onChange={(e) => onPatchAlloc(ai, { link_type: e.target.value as Alloc["link_type"] })}
                  >
                    <option value="sales_order">Auftrag</option>
                    <option value="material">Material</option>
                    <option value="cost_center">Kostenstelle</option>
                  </select>
                </div>
                {a.link_type === "sales_order" && (
                  <div className="field" style={{ width: 160 }}>
                    <label>Auftragsnummer</label>
                    <input value={a.order_number} onChange={(e) => onPatchAlloc(ai, { order_number: e.target.value })} />
                  </div>
                )}
                {a.link_type === "material" && (
                  <div className="field" style={{ width: 200 }}>
                    <label>Material-Referenz</label>
                    <input value={a.material_ref} onChange={(e) => onPatchAlloc(ai, { material_ref: e.target.value })} />
                  </div>
                )}
                {a.link_type === "cost_center" && (
                  <div className="field" style={{ width: 200 }}>
                    <label>Kostenstelle</label>
                    <select value={a.cost_center_id} onChange={(e) => onPatchAlloc(ai, { cost_center_id: e.target.value })}>
                      <option value="">–</option>
                      {costCenters.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field" style={{ width: 110 }}>
                  <label>Betrag (netto)</label>
                  <input value={a.amount ?? ""} onChange={(e) => onPatchAlloc(ai, { amount: numOrNull(e.target.value) })} />
                </div>
                <div className="field" style={{ flex: "1 1 120px" }}>
                  <label>Notiz</label>
                  <input value={a.note} onChange={(e) => onPatchAlloc(ai, { note: e.target.value })} />
                </div>
                <button type="button" className="ghost" onClick={() => onDelAlloc(ai)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
