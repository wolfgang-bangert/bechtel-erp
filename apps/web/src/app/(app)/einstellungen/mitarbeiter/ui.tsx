"use client";

import { useActionState } from "react";
import { MODULES, type ModuleKey, type ModuleLevel } from "@/lib/modules";
import { ladeEin, linkErneutSenden, nachtragen, setzeRechte, zugriffUmschalten, type RowState } from "./actions";

export type Mitarbeiter = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
  isAdmin: boolean;
  module: Partial<Record<ModuleKey, ModuleLevel>>;
};

const empty: RowState = {};

/** Je Modul: kein Zugriff / ansehen / bearbeiten + Admin-Haken (Admin = alle Module). */
function RechteFelder({ module, isAdmin, darfPersonal }: { module: Mitarbeiter["module"]; isAdmin: boolean; darfPersonal: boolean }) {
  // Das Modul Personal vergibt nur, wer es selbst hat (die Datenbank sperrt es sonst ohnehin)
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
      {MODULES.filter((m) => m.key !== "personal" || darfPersonal).map((m) => (
        <label key={m.key} className="count" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {m.label}
          <select name={`m_${m.key}`} defaultValue={module[m.key] ?? ""} style={{ width: 130 }}>
            <option value="">kein Zugriff</option>
            <option value="view">ansehen</option>
            <option value="edit">bearbeiten</option>
          </select>
        </label>
      ))}
      <label className="chk" style={{ paddingBottom: 6 }}>
        <input type="checkbox" name="admin" value="1" defaultChecked={isAdmin} /> Admin (alles außer Personal, auch Mitarbeiter-Verwaltung)
      </label>
    </div>
  );
}

function ZugriffButton({ userId, aktiv }: { userId: string; aktiv: boolean }) {
  const [state, action, pending] = useActionState(zugriffUmschalten, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="aktiv" value={aktiv ? "0" : "1"} />
      <button type="submit" className="ghost" disabled={pending}>
        {pending ? "…" : aktiv ? "Zugriff entziehen" : "Reaktivieren"}
      </button>
      {state.error && <span className="msg-err"> {state.error}</span>}
    </form>
  );
}

function ErneutSendenButton({ email }: { email: string }) {
  const [state, action, pending] = useActionState(linkErneutSenden, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="email" value={email} />
      <button type="submit" className="ghost" disabled={pending} title="Neuen Anmeldelink per Mail schicken">
        {pending ? "…" : "Einladungsmail erneut senden"}
      </button>
      {state.ok && <span className="msg-ok"> ✓ verschickt</span>}
      {state.error && <span className="msg-err"> {state.error}</span>}
    </form>
  );
}

export function MitarbeiterZeile({ m, darfPersonal }: { m: Mitarbeiter; darfPersonal: boolean }) {
  const [state, action, pending] = useActionState(setzeRechte, empty);
  return (
    <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, opacity: m.is_active ? 1 : 0.55 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{m.display_name ?? "—"}</strong>
        <span className="count">{m.email}</span>
        {m.isAdmin && <span className="tag">Admin</span>}
        {!m.is_active && <span className="tag">deaktiviert</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {m.email && <ErneutSendenButton email={m.email} />}
          <ZugriffButton userId={m.id} aktiv={m.is_active} />
        </span>
      </div>
      <form action={action} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <input type="hidden" name="user_id" value={m.id} />
        <RechteFelder module={m.module} isAdmin={m.isAdmin} darfPersonal={darfPersonal} />
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Rechte speichern"}
        </button>
        {state.ok && <span className="msg-ok">✓ gespeichert</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </form>
    </div>
  );
}

export function EinladenForm({ darfPersonal }: { darfPersonal: boolean }) {
  const [state, action, pending] = useActionState(ladeEin, empty);
  return (
    <form action={action} className="row new" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <strong>Neuen Mitarbeiter einladen</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="name" placeholder="Name" className="w-name" required />
        <input name="email" type="email" placeholder="E-Mail" style={{ width: 240 }} required />
      </div>
      <RechteFelder module={{}} isAdmin={false} darfPersonal={darfPersonal} />
      <div>
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Einladen"}
        </button>
        {state.ok && <span className="msg-ok"> ✓ Einladung verschickt</span>}
        {state.error && <span className="msg-err"> {state.error}</span>}
      </div>
    </form>
  );
}

export function NachtragenForm({ darfPersonal }: { darfPersonal: boolean }) {
  const [state, action, pending] = useActionState(nachtragen, empty);
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="count" style={{ cursor: "pointer" }}>
        Bestehendes Konto nachtragen (schon im Supabase-Dashboard angelegt)
      </summary>
      <form action={action} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, marginTop: 6 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="name" placeholder="Name" className="w-name" required />
          <input name="email" type="email" placeholder="E-Mail (wie im Dashboard)" style={{ width: 240 }} required />
        </div>
        <RechteFelder module={{}} isAdmin={false} darfPersonal={darfPersonal} />
        <div>
          <button type="submit" disabled={pending}>
            {pending ? "…" : "Nachtragen"}
          </button>
          {state.ok && <span className="msg-ok"> ✓ ergänzt</span>}
          {state.error && <span className="msg-err"> {state.error}</span>}
        </div>
      </form>
      <p className="count" style={{ marginTop: 4 }}>
        Verschickt keine neue Mail - für Konten, die vor dieser Funktion direkt im Supabase-Dashboard entstanden sind.
      </p>
    </details>
  );
}
