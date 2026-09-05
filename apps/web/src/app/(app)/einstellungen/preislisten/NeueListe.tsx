"use client";

import { useActionState } from "react";
import { neueListeAction, kopiereListeAction, type State } from "./actions";

const empty: State = {};

export function NeueListe({ basen }: { basen: { id: string; name: string }[] }) {
  const [ns, neuAction, neuPending] = useActionState(neueListeAction, empty);
  const [ks, kopAction, kopPending] = useActionState(kopiereListeAction, empty);

  return (
    <div className="row" style={{ border: "none", padding: 0, gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
      <form action={kopAction} className="rows" style={{ maxWidth: 340 }}>
        <strong>Neue Ausgabe aus bestehender berechnen</strong>
        <label className="field">
          <span>Basis-Ausgabe</span>
          <select name="basis_id" defaultValue={basen[0]?.id ?? ""}>
            {basen.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <div className="row" style={{ border: "none", padding: 0 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Name</span>
            <input name="name" placeholder="Preisliste ab 2027-01-01" required />
          </label>
          <label className="field" style={{ width: 90 }}>
            <span>+ Prozent</span>
            <input name="prozent" defaultValue="0" inputMode="decimal" />
          </label>
        </div>
        <div className="row" style={{ border: "none", padding: 0 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>gültig ab</span>
            <input type="date" name="gueltig_ab" required />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>gültig bis</span>
            <input type="date" name="gueltig_bis" />
          </label>
        </div>
        <div>
          <button type="submit" disabled={kopPending}>{kopPending ? "…" : "Ausgabe kopieren"}</button>
          {ks.error && <span className="msg-err"> {ks.error}</span>}
        </div>
      </form>

      <form action={neuAction} className="rows" style={{ maxWidth: 300 }}>
        <strong>Leere Ausgabe anlegen</strong>
        <label className="field">
          <span>Name</span>
          <input name="name" placeholder="Kalkulation 2027" required />
        </label>
        <div className="row" style={{ border: "none", padding: 0 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>gültig ab</span>
            <input type="date" name="gueltig_ab" required />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>gültig bis</span>
            <input type="date" name="gueltig_bis" />
          </label>
        </div>
        <div>
          <button type="submit" disabled={neuPending}>{neuPending ? "…" : "Anlegen"}</button>
          {ns.error && <span className="msg-err"> {ns.error}</span>}
        </div>
      </form>
    </div>
  );
}
