"use client";

import { useActionState } from "react";
import { PERSONAL_FELDER, PERSONAL_GRUPPEN, type PersonalFeld } from "@werk/shared/personal/felder";
import { personSpeichern, type State } from "../actions";

const empty: State = {};

export type Login = { id: string; label: string };

function Eingabe({ f, wert }: { f: PersonalFeld; wert: unknown }) {
  const name = `f_${f.spalte}`;
  const v = wert == null ? "" : String(wert);
  switch (f.typ) {
    case "ja_nein":
      return (
        <>
          <input type="hidden" name={`da_${f.spalte}`} value="1" />
          <input type="checkbox" name={name} value="1" defaultChecked={wert === true} />
        </>
      );
    case "mehrzeilig":
      return <textarea name={name} defaultValue={v} rows={Math.min(6, Math.max(2, v.split("\n").length))} style={{ width: "100%" }} />;
    case "datum":
      return <input type="date" name={name} defaultValue={v} />;
    case "zahl":
    case "betrag":
      return <input name={name} inputMode="decimal" defaultValue={v ? v.replace(".", ",") : ""} style={{ width: 140 }} />;
    case "email":
      // kein type="email": eine ungültige Adresse aus Ninox würde sonst das ganze Formular blockieren
      return <input inputMode="email" name={name} defaultValue={v} style={{ width: "100%" }} />;
    default:
      return <input name={name} defaultValue={v} style={{ width: "100%" }} />;
  }
}

/** Alle Felder einer Person, nach Gruppen; sensible Gruppen eingeklappt. */
export function PersonForm({
  person,
  logins,
  darfBearbeiten,
}: {
  person: Record<string, unknown>;
  logins: Login[];
  darfBearbeiten: boolean;
}) {
  const [state, action, pending] = useActionState(personSpeichern, empty);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={String(person.id)} />
      <fieldset disabled={!darfBearbeiten} style={{ border: 0, padding: 0, margin: 0 }}>
        <h2>werk</h2>
        <dl className="kv">
          <dt>Login (Zeiterfassung)</dt>
          <dd>
            <select name="app_user_id" defaultValue={String(person.app_user_id ?? "")} style={{ minWidth: 260 }}>
              <option value="">– kein Login –</option>
              {logins.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </dd>
          <dt>Aktiv</dt>
          <dd>
            <label className="chk">
              <input type="checkbox" name="aktiv" value="1" defaultChecked={person.aktiv !== false} /> beschäftigt
              (inaktive können nicht stempeln)
            </label>
          </dd>
        </dl>

        {PERSONAL_GRUPPEN.map((g) => {
          const felder = PERSONAL_FELDER.filter((f) => f.gruppe === g);
          const sensibel = felder.some((f) => f.sensibel);
          const inhalt = (
            <dl className="kv">
              {felder.map((f) => (
                <div key={f.spalte} style={{ display: "contents" }}>
                  <dt>{f.label}</dt>
                  <dd>
                    <Eingabe f={f} wert={person[f.spalte]} />
                  </dd>
                </div>
              ))}
            </dl>
          );
          return sensibel ? (
            <details key={g} style={{ margin: "16px 0" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{g} (vertraulich – zum Anzeigen klicken)</summary>
              {inhalt}
            </details>
          ) : (
            <section key={g}>
              <h2>{g}</h2>
              {inhalt}
            </section>
          );
        })}

        <div className="toolbar" style={{ position: "sticky", bottom: 0, background: "var(--bg)", padding: "10px 0" }}>
          <button type="submit" disabled={pending}>
            {pending ? "Speichere …" : "Speichern"}
          </button>
          {state.ok && <span className="msg-ok">Gespeichert.</span>}
          {state.error && <span className="msg-err">{state.error}</span>}
        </div>
      </fieldset>
    </form>
  );
}
