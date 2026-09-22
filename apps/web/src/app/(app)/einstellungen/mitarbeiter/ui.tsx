"use client";

import { useActionState } from "react";
import type { AppRole } from "@/lib/auth";
import { ladeEin, rolleEntfernen, rolleHinzufuegen, zugriffUmschalten, type RowState } from "./actions";

export const ROLLEN_LABEL: Record<AppRole, string> = {
  admin: "Admin (volle Rechte)",
  office: "Vertrieb / Auftragsbearbeitung",
  accounting: "Buchhaltung",
  production: "Produktion",
  shipping: "Versand",
  employee: "Mitarbeiter (allgemein)",
  customer: "Kunde",
  supplier: "Lieferant",
};
const STAFF_ROLLEN: AppRole[] = ["admin", "office", "accounting", "production", "shipping", "employee"];

export type Rolle = { id: string; role: AppRole };
export type Mitarbeiter = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
  rollen: Rolle[];
};

const empty: RowState = {};

function RolleBadge({ rolle }: { rolle: Rolle }) {
  const [state, action, pending] = useActionState(rolleEntfernen, empty);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="user_role_id" value={rolle.id} />
      <span className="tag" style={{ marginRight: 4 }}>
        {ROLLEN_LABEL[rolle.role]}{" "}
        <button
          type="submit"
          className="ghost"
          disabled={pending}
          style={{ padding: "0 4px", marginLeft: 2 }}
          title="Rolle entfernen"
        >
          ✕
        </button>
      </span>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

function RolleHinzufuegenForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(rolleHinzufuegen, empty);
  return (
    <form action={action} className="toolbar" style={{ gap: 4, display: "inline-flex" }}>
      <input type="hidden" name="user_id" value={userId} />
      <select name="rolle" style={{ width: 170 }} defaultValue="">
        <option value="" disabled>
          + Rolle …
        </option>
        {STAFF_ROLLEN.map((r) => (
          <option key={r} value={r}>
            {ROLLEN_LABEL[r]}
          </option>
        ))}
      </select>
      <button type="submit" className="ghost" disabled={pending}>
        {pending ? "…" : "+"}
      </button>
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
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
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function MitarbeiterZeile({ m }: { m: Mitarbeiter }) {
  return (
    <div className="row" style={{ flexWrap: "wrap", opacity: m.is_active ? 1 : 0.5 }}>
      <span className="w-name">
        {m.display_name ?? "—"}
        {!m.is_active && <span className="tag" style={{ marginLeft: 6 }}>deaktiviert</span>}
      </span>
      <span className="count" style={{ width: 220 }}>
        {m.email}
      </span>
      <span>
        {m.rollen.map((r) => (
          <RolleBadge key={r.id} rolle={r} />
        ))}
        <RolleHinzufuegenForm userId={m.id} />
      </span>
      <ZugriffButton userId={m.id} aktiv={m.is_active} />
    </div>
  );
}

export function EinladenForm() {
  const [state, action, pending] = useActionState(ladeEin, empty);
  return (
    <form action={action} className="row new" style={{ flexWrap: "wrap" }}>
      <input name="name" placeholder="Name" className="w-name" required />
      <input name="email" type="email" placeholder="E-Mail" style={{ width: 220 }} required />
      <select name="rolle" defaultValue="office" style={{ width: 220 }}>
        {STAFF_ROLLEN.map((r) => (
          <option key={r} value={r}>
            {ROLLEN_LABEL[r]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Einladen"}
      </button>
      {state.ok && <span className="msg-ok">✓ Einladung verschickt</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
