"use client";

import { useActionState, useState } from "react";
import { saveIncoming, type SaveState } from "../actions";

const empty: SaveState = {};

type Opt = { id: string; label: string };

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
}: {
  doc: Record<string, unknown>;
  items: Pos[];
  taxCodes: Opt[];
  costCenters: Opt[];
}) {
  const [state, action, pending] = useActionState(saveIncoming, empty);
  const v = (k: string) => (doc[k] == null ? "" : String(doc[k]));
  const [positions, setPositions] = useState<Pos[]>(
    items.length
      ? items
      : [],
  );

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
  const delPos = (i: number) => setPositions((xs) => xs.filter((_, k) => k !== i));

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

      <h2>Lieferant</h2>
      <F name="supplier_name" label="Name" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <F name="supplier_vat_id" label="USt-IdNr" w={200} />
        <F name="supplier_iban" label="IBAN (laut Beleg)" w={260} />
      </div>
      <div className="field">
        <label htmlFor="supplier_organization_id">
          verknüpfte Organisation (ID) —{" "}
          {v("supplier_organization_id") ? "zugeordnet" : "nicht zugeordnet"}
        </label>
        <input
          id="supplier_organization_id"
          name="supplier_organization_id"
          defaultValue={v("supplier_organization_id")}
          placeholder="organization.id"
        />
      </div>

      <h2>Abweichender Zahlungsempfänger</h2>
      <p className="lead" style={{ marginTop: -6 }}>
        z.B. Insolvenzverwalter, Factoring/RatePay, Inkasso, Forderungsabtretung.
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          type="checkbox"
          name="payee_differs"
          defaultChecked={v("payee_differs") === "true"}
        />
        Zahlung geht nicht an den Lieferanten selbst
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <F name="payee_name" label="Empfänger" w={240} />
        <F name="payee_iban" label="IBAN Empfänger" w={260} />
        <F name="payee_reason" label="Grund" w={200} />
      </div>

      <h2>Beleg</h2>
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
      <div style={{ display: "flex", gap: 12 }}>
        <F name="net_amount" label="Netto" w={140} />
        <F name="tax_amount" label="USt" w={140} />
        <F name="gross_amount" label="Brutto" w={140} />
      </div>

      <h2>Fälligkeiten</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <F name="discount_date" label="Skonto-Termin" type="date" w={160} />
        <F name="discount_percent" label="Skonto %" w={100} />
        <F name="discount_amount" label="Skonto-Betrag" w={140} />
        <F name="net_due_date" label="Netto-Termin" type="date" w={160} />
      </div>

      <h2>Kontierung (Vorgabe)</h2>
      <p className="lead" style={{ marginTop: -6 }}>
        Gilt für alle Positionen ohne eigene Angabe.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <F name="ledger_account" label="Aufwandskonto (SKR03)" w={180} />
        <div className="field" style={{ width: 220 }}>
          <label htmlFor="tax_code_id">Steuerschlüssel</label>
          <select id="tax_code_id" name="tax_code_id" defaultValue={v("tax_code_id")}>
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

      <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Positionen
        <button type="button" className="ghost" onClick={addPos}>+ Position</button>
      </h2>

      {positions.length === 0 && (
        <p className="lead">Keine Positionen. „+ Position" zum Anlegen.</p>
      )}

      {positions.map((p, pi) => {
        const allocSum = p.allocations.reduce((s, a) => s + (a.amount ?? 0), 0);
        const mismatch =
          p.allocations.length > 0 &&
          p.net_amount != null &&
          Math.abs(allocSum - p.net_amount) > 0.01;
        return (
          <div key={pi} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ width: 60 }}>
                <label>Pos.</label>
                <input
                  value={p.position ?? ""}
                  onChange={(e) => patchPos(pi, { position: numOrNull(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Beschreibung</label>
                <input
                  value={p.description}
                  onChange={(e) => patchPos(pi, { description: e.target.value })}
                />
              </div>
              <button type="button" className="ghost" onClick={() => delPos(pi)}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <div className="field" style={{ width: 90 }}>
                <label>Menge</label>
                <input value={p.quantity ?? ""} onChange={(e) => patchPos(pi, { quantity: numOrNull(e.target.value) })} />
              </div>
              <div className="field" style={{ width: 110 }}>
                <label>Einzelpreis</label>
                <input value={p.unit_price ?? ""} onChange={(e) => patchPos(pi, { unit_price: numOrNull(e.target.value) })} />
              </div>
              <div className="field" style={{ width: 80 }}>
                <label>USt %</label>
                <input value={p.tax_rate ?? ""} onChange={(e) => patchPos(pi, { tax_rate: numOrNull(e.target.value) })} />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label>Netto</label>
                <input value={p.net_amount ?? ""} onChange={(e) => patchPos(pi, { net_amount: numOrNull(e.target.value) })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <div className="field" style={{ width: 150 }}>
                <label>Konto (überschreibt)</label>
                <input value={p.ledger_account} onChange={(e) => patchPos(pi, { ledger_account: e.target.value })} />
              </div>
              <div className="field" style={{ width: 200 }}>
                <label>Steuerschlüssel</label>
                <select value={p.tax_code_id} onChange={(e) => patchPos(pi, { tax_code_id: e.target.value })}>
                  <option value="">(Vorgabe)</option>
                  {taxCodes.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ width: 160 }}>
                <label>Material-Referenz</label>
                <input value={p.material_ref} onChange={(e) => patchPos(pi, { material_ref: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Aufteilung</strong>
                <button type="button" className="ghost" onClick={() => addAlloc(pi)}>+ Zuordnung</button>
              </div>
              {mismatch && (
                <p className="msg-err" style={{ margin: "4px 0" }}>
                  Summe Aufteilung {allocSum.toFixed(2)} ≠ Netto {p.net_amount?.toFixed(2)}
                </p>
              )}
              {p.allocations.map((a, ai) => (
                <div
                  key={ai}
                  style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}
                >
                  <div className="field" style={{ width: 140 }}>
                    <label>Ziel</label>
                    <select
                      value={a.link_type}
                      onChange={(e) => patchAlloc(pi, ai, { link_type: e.target.value as Alloc["link_type"] })}
                    >
                      <option value="sales_order">Auftrag</option>
                      <option value="material">Material</option>
                      <option value="cost_center">Kostenstelle</option>
                    </select>
                  </div>
                  {a.link_type === "sales_order" && (
                    <div className="field" style={{ width: 160 }}>
                      <label>Auftragsnummer</label>
                      <input
                        value={a.order_number}
                        onChange={(e) => patchAlloc(pi, ai, { order_number: e.target.value })}
                      />
                    </div>
                  )}
                  {a.link_type === "material" && (
                    <div className="field" style={{ width: 200 }}>
                      <label>Material-Referenz</label>
                      <input
                        value={a.material_ref}
                        onChange={(e) => patchAlloc(pi, ai, { material_ref: e.target.value })}
                      />
                    </div>
                  )}
                  {a.link_type === "cost_center" && (
                    <div className="field" style={{ width: 200 }}>
                      <label>Kostenstelle</label>
                      <select
                        value={a.cost_center_id}
                        onChange={(e) => patchAlloc(pi, ai, { cost_center_id: e.target.value })}
                      >
                        <option value="">–</option>
                        {costCenters.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="field" style={{ width: 110 }}>
                    <label>Betrag (netto)</label>
                    <input
                      value={a.amount ?? ""}
                      onChange={(e) => patchAlloc(pi, ai, { amount: numOrNull(e.target.value) })}
                    />
                  </div>
                  <div className="field" style={{ flex: "1 1 120px" }}>
                    <label>Notiz</label>
                    <input value={a.note} onChange={(e) => patchAlloc(pi, ai, { note: e.target.value })} />
                  </div>
                  <button type="button" className="ghost" onClick={() => delAlloc(pi, ai)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

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
