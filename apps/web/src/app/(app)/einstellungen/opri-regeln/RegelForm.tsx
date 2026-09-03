"use client";

import { useActionState, useState } from "react";
import { saveRegel, deleteRegel, type State } from "./actions";

const empty: State = {};

export type Regel = {
  id: string;
  name: string;
  ebene: string;
  gruppe_id: string | null;
  stammartikel_id: string | null;
  option_match: string | null;
  bedingung: unknown;
  modus: string;
  material_rolle: string | null;
  verwendung: string | null;
  herkunft: string | null;
  material_id: string | null;
  mengen_formel: string;
  grammatur: string | null;
  format: string | null;
  produktionshinweis: string | null;
  zaehlt_zur_blockstaerke: boolean;
  seite: string | null;
  bedruckt: boolean | null;
  prio: number;
  is_active: boolean;
  notiz: string | null;
};
type Opt = { id: string; label: string };

const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);

export function RegelForm({
  regel,
  gruppen,
  stammartikel,
  material,
  rollen,
}: {
  regel?: Regel;
  gruppen: Opt[];
  stammartikel: Opt[];
  material: Opt[];
  rollen: string[];
}) {
  const [state, action, pending] = useActionState(saveRegel, empty);
  const [dState, dAction] = useActionState(deleteRegel, empty);
  const [ebene, setEbene] = useState(regel?.ebene ?? "gruppe");
  const [herkunft, setHerkunft] = useState(regel?.herkunft ?? "");

  return (
    <form action={action} className="rows" style={{ maxWidth: 640 }}>
      {regel && <input type="hidden" name="id" value={regel.id} />}

      <F label="Name">
        <input name="name" defaultValue={regel?.name ?? ""} required />
      </F>

      <div className="row" style={{ border: "none", padding: 0 }}>
        <F label="Ebene">
          <select name="ebene" value={ebene} onChange={(e) => setEbene(e.target.value)}>
            <option value="gruppe">Produktgruppe</option>
            <option value="stammartikel">Stammartikel</option>
            <option value="option">Option</option>
          </select>
        </F>
        <F label="Modus">
          <select name="modus" defaultValue={regel?.modus ?? "hinzufuegen"}>
            <option value="hinzufuegen">hinzufügen</option>
            <option value="ersetzen">ersetzen (Rolle)</option>
            <option value="entfernen">entfernen (Rolle)</option>
          </select>
        </F>
        <F label="Prio">
          <input name="prio" defaultValue={regel?.prio ?? 100} style={{ width: 70 }} inputMode="numeric" />
        </F>
      </div>

      {ebene === "gruppe" && (
        <F label="Produktgruppe">
          <select name="gruppe_id" defaultValue={regel?.gruppe_id ?? ""}>
            <option value="">—</option>
            {gruppen.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </F>
      )}
      {ebene === "stammartikel" && (
        <F label="Stammartikel">
          <select name="stammartikel_id" defaultValue={regel?.stammartikel_id ?? ""}>
            <option value="">—</option>
            {stammartikel.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </F>
      )}
      {ebene === "option" && (
        <F label="Option-Match (Typname oder SKU-Präfix)">
          <input name="option_match" defaultValue={regel?.option_match ?? ""} placeholder="z.B. Wire-O-Bindung" />
        </F>
      )}

      <F label="Zusatzbedingung (JSON, optional)">
        <textarea
          name="bedingung"
          rows={2}
          defaultValue={regel?.bedingung ? JSON.stringify(regel.bedingung) : ""}
          placeholder='{"grammatur_min":250}'
          style={{ font: "inherit" }}
        />
      </F>

      <h2>Materialzeile</h2>
      <div className="row" style={{ border: "none", padding: 0 }}>
        <F label="Rolle">
          <input name="material_rolle" defaultValue={regel?.material_rolle ?? ""} list="rollen-list" />
          <datalist id="rollen-list">
            {rollen.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </F>
        <F label="Verwendung">
          <input name="verwendung" defaultValue={regel?.verwendung ?? ""} placeholder="Kalendarium, Rückblatt …" />
        </F>
      </div>

      <div className="row" style={{ border: "none", padding: 0 }}>
        <F label="Herkunft">
          <select name="herkunft" value={herkunft} onChange={(e) => setHerkunft(e.target.value)}>
            <option value="">—</option>
            <option value="katalog_fix">fester Katalogeintrag</option>
            <option value="aus_grammatur_oberflaeche">aus Grammatur + Oberfläche</option>
            <option value="aus_format">aus Format</option>
            <option value="wire_o_blockstaerke">Wire-O aus Blockstärke</option>
            <option value="aus_farbe_text">aus Farbe (Text)</option>
          </select>
        </F>
        {herkunft === "katalog_fix" && (
          <F label="Material">
            <select name="material_id" defaultValue={regel?.material_id ?? ""}>
              <option value="">—</option>
              {material.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </F>
        )}
      </div>

      <div className="row" style={{ border: "none", padding: 0 }}>
        <F label="Mengenformel">
          <input name="mengen_formel" defaultValue={regel?.mengen_formel ?? "auflage"} placeholder="auflage" style={{ width: 120 }} />
        </F>
        <F label="Grammatur">
          <input name="grammatur" defaultValue={regel?.grammatur ?? ""} style={{ width: 90 }} />
        </F>
        <F label="Format">
          <input name="format" defaultValue={regel?.format ?? ""} placeholder="31,5 × 43,8 cm" style={{ width: 130 }} />
        </F>
      </div>

      <div className="row" style={{ border: "none", padding: 0 }}>
        <F label="Seite">
          <select name="seite" defaultValue={regel?.seite ?? ""}>
            <option value="">—</option>
            <option value="vorderseite">Vorderseite</option>
            <option value="rueckseite">Rückseite</option>
          </select>
        </F>
        <F label="bedruckt">
          <select name="bedruckt" defaultValue={regel?.bedruckt === true ? "ja" : regel?.bedruckt === false ? "nein" : ""}>
            <option value="">—</option>
            <option value="ja">ja</option>
            <option value="nein">nein</option>
          </select>
        </F>
        <label className="chk">
          <input type="checkbox" name="zaehlt_zur_blockstaerke" defaultChecked={regel?.zaehlt_zur_blockstaerke ?? false} />{" "}
          zählt zur Blockstärke
        </label>
      </div>

      <F label="Produktionshinweis">
        <input name="produktionshinweis" defaultValue={regel?.produktionshinweis ?? ""} />
      </F>
      <F label="Notiz">
        <input name="notiz" defaultValue={regel?.notiz ?? ""} />
      </F>
      <label className="chk">
        <input type="checkbox" name="is_active" defaultChecked={regel?.is_active ?? true} /> aktiv
      </label>

      <div className="row" style={{ border: "none", padding: 0, gap: 10 }}>
        <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
        {regel && (
          <button
            type="submit"
            className="ghost"
            formAction={dAction}
            formNoValidate
            onClick={(e) => {
              if (!confirm("Regel löschen?")) e.preventDefault();
            }}
          >
            Löschen
          </button>
        )}
        {state.error && <span className="msg-err">{state.error}</span>}
        {dState.error && <span className="msg-err">{dState.error}</span>}
      </div>
    </form>
  );
}
