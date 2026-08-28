"use client";

import { useActionState } from "react";
import { saveCompanyProfile, type FormState } from "./actions";

export type CompanyProfile = {
  name?: string;
  legal_name?: string;
  address?: { line1?: string; zip?: string; city?: string; country?: string };
  vat_id?: string;
  tax_number?: string;
  bank?: { iban?: string; bic?: string; name?: string };
};

const empty: FormState = {};

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

export function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const [state, action, pending] = useActionState(saveCompanyProfile, empty);
  const a = profile.address ?? {};
  const b = profile.bank ?? {};

  return (
    <form action={action} style={{ maxWidth: 520 }}>
      <h2>Firma</h2>
      <Field label="Firmenname" name="name" defaultValue={profile.name} required />
      <Field
        label="Rechtsform / abweichende Firmierung"
        name="legal_name"
        defaultValue={profile.legal_name}
      />

      <h2>Anschrift</h2>
      <Field label="Straße und Nr." name="line1" defaultValue={a.line1} />
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ width: 120 }}>
          <Field label="PLZ" name="zip" defaultValue={a.zip} />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Ort" name="city" defaultValue={a.city} />
        </div>
        <div style={{ width: 90 }}>
          <Field label="Land" name="country" defaultValue={a.country ?? "DE"} />
        </div>
      </div>

      <h2>Steuer</h2>
      <Field label="USt-IdNr" name="vat_id" defaultValue={profile.vat_id} placeholder="DE…" />
      <Field label="Steuernummer" name="tax_number" defaultValue={profile.tax_number} />

      <h2>Bankverbindung</h2>
      <Field label="IBAN" name="iban" defaultValue={b.iban} />
      <Field label="BIC" name="bic" defaultValue={b.bic} />
      <Field label="Bank" name="bank_name" defaultValue={b.name} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
        <button type="submit" disabled={pending}>
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {state.ok && <span className="msg-ok">✓ gespeichert</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}
