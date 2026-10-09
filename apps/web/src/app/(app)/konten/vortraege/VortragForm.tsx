"use client";

import { useActionState } from "react";
import { vortragSpeichern, type State } from "./actions";

const empty: State = {};

/** Eine Zeile: Konto, Betrag, Soll/Haben, Notiz → speichern (überschreibt den Vortrag des Kontos im Jahr). */
export function VortragForm({
  jahr,
  konto,
  betrag,
  seite,
  notiz,
  knopf = "Speichern",
}: {
  jahr: number;
  konto?: string;
  betrag?: number;
  seite?: "S" | "H";
  notiz?: string | null;
  knopf?: string;
}) {
  const [state, action, pending] = useActionState(vortragSpeichern, empty);
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="jahr" value={jahr} />
      <input name="konto" defaultValue={konto} placeholder="Konto" style={{ width: 80 }} readOnly={!!konto} required />
      <input name="betrag" defaultValue={betrag != null ? betrag.toFixed(2).replace(".", ",") : ""} placeholder="Betrag" inputMode="decimal" style={{ width: 120, textAlign: "right" }} required />
      <select name="seite" defaultValue={seite ?? "H"}>
        <option value="S">Soll</option>
        <option value="H">Haben</option>
      </select>
      <input name="notiz" defaultValue={notiz ?? ""} placeholder="Notiz (z. B. lt. Bilanz 2025)" style={{ width: 240 }} />
      <button type="submit" className="ghost" disabled={pending} style={{ padding: "3px 10px" }}>
        {knopf}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
