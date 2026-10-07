"use client";

import { useActionState } from "react";
import { savePreisFelderAction, preisErmittelnAction, type State } from "../actions";

const empty: State = {};

export function PreisPanel({
  id,
  versandDatum,
  berechnet,
  istRekla,
  reklaVermerk,
  betragAbweichend,
  preisNetto,
  preisQuelle,
}: {
  id: string;
  versandDatum: string | null;
  berechnet: boolean;
  istRekla: boolean;
  reklaVermerk: string | null;
  betragAbweichend: number | null;
  preisNetto: number | null;
  preisQuelle: string | null;
}) {
  const [save, saveAction, savePending] = useActionState(savePreisFelderAction, empty);
  const [preis, preisAction, preisPending] = useActionState(preisErmittelnAction, empty);

  return (
    <div className="bd-card" style={{ maxWidth: 560 }}>
      <dl className="bd-facts" style={{ marginBottom: 12 }}>
        <div>
          <dt>Preis (netto)</dt>
          <dd>
            {preisNetto != null ? `${Number(preisNetto).toFixed(2)} €` : "—"}
            {preisQuelle && <span className="bd-mute" style={{ fontWeight: 400 }}> · {preisQuelle}</span>}
          </dd>
        </div>
      </dl>
      <form action={preisAction} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="bd-btn bd-btn-secondary" disabled={preisPending}>
          {preisPending ? "…" : "Preis ermitteln"}
        </button>
        {preis.ok && <span className="bd-ok">✓ {preis.note}</span>}
        {preis.error && <span className="bd-err">{preis.error}</span>}
      </form>

      <form action={saveAction} className="bd-form-col" style={{ marginTop: 18 }}>
        <input type="hidden" name="id" value={id} />
        <div className="bd-field">
          <label className="bd-field-label" htmlFor="versand_datum">
            Versanddatum (für KW-Abrechnung + Preisstand)
          </label>
          <input
            className="bd-field-input"
            id="versand_datum"
            type="date"
            name="versand_datum"
            defaultValue={versandDatum ?? ""}
            style={{ width: 180 }}
          />
        </div>
        <label className="bd-check" style={{ marginTop: 0 }}>
          <input type="checkbox" name="berechnet" defaultChecked={berechnet} /> wird berechnet
        </label>
        <label className="bd-check" style={{ marginTop: 0 }}>
          <input type="checkbox" name="ist_rekla" defaultChecked={istRekla} /> Reklamation (nicht berechnen)
        </label>
        <div className="bd-field">
          <label className="bd-field-label" htmlFor="betrag_abweichend">
            Abweichender Betrag (netto) – z. B. bei Teil-Reklamation; leer = Listenpreis
          </label>
          <input
            className="bd-field-input"
            id="betrag_abweichend"
            name="betrag_abweichend"
            inputMode="decimal"
            defaultValue={betragAbweichend != null ? Number(betragAbweichend).toFixed(2) : ""}
            style={{ width: 140 }}
          />
        </div>
        <div className="bd-field">
          <label className="bd-field-label" htmlFor="rekla_vermerk">Begründung / Vermerk (erscheint auf der Aufstellung)</label>
          <textarea
            className="bd-field-input"
            id="rekla_vermerk"
            name="rekla_vermerk"
            rows={2}
            defaultValue={reklaVermerk ?? ""}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit" className="bd-btn bd-btn-primary" disabled={savePending}>
            {savePending ? "…" : "Speichern"}
          </button>
          {save.ok && <span className="bd-ok">✓ {save.note}</span>}
          {save.error && <span className="bd-err">{save.error}</span>}
        </div>
      </form>
    </div>
  );
}
