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
  preisNetto,
  preisQuelle,
}: {
  id: string;
  versandDatum: string | null;
  berechnet: boolean;
  istRekla: boolean;
  reklaVermerk: string | null;
  preisNetto: number | null;
  preisQuelle: string | null;
}) {
  const [save, saveAction, savePending] = useActionState(savePreisFelderAction, empty);
  const [preis, preisAction, preisPending] = useActionState(preisErmittelnAction, empty);

  return (
    <div className="rows" style={{ maxWidth: 520 }}>
      <dl className="kv">
        <dt>Preis (netto)</dt>
        <dd>
          {preisNetto != null ? `${Number(preisNetto).toFixed(2)} €` : "—"}
          {preisQuelle && <span className="count"> · {preisQuelle}</span>}
        </dd>
      </dl>
      <form action={preisAction} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" disabled={preisPending}>{preisPending ? "…" : "Preis ermitteln"}</button>
        {preis.ok && <span className="msg-ok">✓ {preis.note}</span>}
        {preis.error && <span className="msg-err">{preis.error}</span>}
      </form>

      <form action={saveAction} className="rows" style={{ marginTop: 10 }}>
        <input type="hidden" name="id" value={id} />
        <label className="field">
          <span>Versanddatum (für KW-Abrechnung + Preisstand)</span>
          <input type="date" name="versand_datum" defaultValue={versandDatum ?? ""} />
        </label>
        <label className="chk">
          <input type="checkbox" name="berechnet" defaultChecked={berechnet} /> wird berechnet
        </label>
        <label className="chk">
          <input type="checkbox" name="ist_rekla" defaultChecked={istRekla} /> Reklamation (nicht berechnen)
        </label>
        <label className="field">
          <span>Rekla-Vermerk</span>
          <textarea name="rekla_vermerk" rows={2} defaultValue={reklaVermerk ?? ""} style={{ font: "inherit" }} />
        </label>
        <div>
          <button type="submit" disabled={savePending}>{savePending ? "…" : "Speichern"}</button>
          {save.ok && <span className="msg-ok"> ✓ {save.note}</span>}
          {save.error && <span className="msg-err"> {save.error}</span>}
        </div>
      </form>
    </div>
  );
}
