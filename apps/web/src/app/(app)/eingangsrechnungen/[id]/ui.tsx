"use client";

import { useActionState } from "react";
import { saveIncoming, type SaveState } from "../actions";

const empty: SaveState = {};

type Opt = { id: string; label: string };

export function ReviewForm({
  doc,
  taxCodes,
  costCenters,
}: {
  doc: Record<string, unknown>;
  taxCodes: Opt[];
  costCenters: Opt[];
}) {
  const [state, action, pending] = useActionState(saveIncoming, empty);
  const v = (k: string) => (doc[k] == null ? "" : String(doc[k]));

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

      <h2>Lieferant</h2>
      <F name="supplier_name" label="Name" />
      <div style={{ display: "flex", gap: 12 }}>
        <F name="supplier_vat_id" label="USt-IdNr" />
        <F name="supplier_iban" label="IBAN" />
      </div>
      <div className="field">
        <label htmlFor="supplier_organization_id">
          verknüpfte Organisation (ID) — {v("supplier_organization_id") ? "gefunden" : "nicht zugeordnet"}
        </label>
        <input
          id="supplier_organization_id"
          name="supplier_organization_id"
          defaultValue={v("supplier_organization_id")}
          placeholder="organization.id"
        />
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
        <F name="due_date" label="Fällig" type="date" w={160} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <F name="net_amount" label="Netto" w={140} />
        <F name="tax_amount" label="USt" w={140} />
        <F name="gross_amount" label="Brutto" w={140} />
      </div>

      <h2>Kontierung</h2>
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
      <div className="field">
        <label htmlFor="notes">Notiz</label>
        <input id="notes" name="notes" defaultValue={v("notes")} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" disabled={pending}>
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {state.ok && <span className="msg-ok">✓ gespeichert</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}
