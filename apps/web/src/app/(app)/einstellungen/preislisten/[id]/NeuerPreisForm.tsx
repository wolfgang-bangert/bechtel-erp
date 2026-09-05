"use client";

import { useActionState } from "react";
import { neuerPreisAction, type State } from "../actions";

const empty: State = {};

export function NeuerPreisForm({ listeId, kategorien }: { listeId: string; kategorien: string[] }) {
  const [state, action, pending] = useActionState(neuerPreisAction, empty);
  return (
    <details style={{ margin: "12px 0" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Preiszeile hinzufügen</summary>
      <form action={action} className="row" style={{ border: "none", padding: "8px 0 0", gap: 8, flexWrap: "wrap" }}>
        <input type="hidden" name="liste_id" value={listeId} />
        <label className="field" style={{ width: 150 }}>
          <span>Kategorie</span>
          <input name="kategorie" list="kat-list" required />
          <datalist id="kat-list">
            {kategorien.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>
        <label className="field" style={{ width: 90 }}>
          <span>Gruppe</span>
          <input name="produktgruppe" placeholder="DKL" />
        </label>
        <label className="field" style={{ width: 80 }}>
          <span>Format</span>
          <input name="format" placeholder="A5" />
        </label>
        <label className="field" style={{ width: 60 }}>
          <span>Blatt</span>
          <input name="blatt" inputMode="numeric" />
        </label>
        <label className="field" style={{ width: 80 }}>
          <span>Sorte</span>
          <input name="sorte" placeholder="170" />
        </label>
        <label className="field" style={{ width: 70 }}>
          <span>Farbe</span>
          <input name="farbigkeit" placeholder="4/0" />
        </label>
        <label className="field" style={{ width: 80 }}>
          <span>Auflage</span>
          <input name="auflage" inputMode="numeric" required />
        </label>
        <label className="field" style={{ width: 90 }}>
          <span>Preis netto</span>
          <input name="preis_netto" inputMode="decimal" required />
        </label>
        <div style={{ alignSelf: "flex-end" }}>
          <button type="submit" disabled={pending}>{pending ? "…" : "Anlegen"}</button>
        </div>
        {state.ok && <span className="msg-ok">✓ {state.note}</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </form>
    </details>
  );
}
