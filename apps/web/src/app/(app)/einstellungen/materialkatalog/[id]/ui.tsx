"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { umbuchungZielMenge, unterMindestbestand } from "@werk/shared/material/bezug";
import { speichereBezug, loescheBezug, umbuchen, type RowState } from "./actions";

export type Bezug = {
  id: string;
  material_id: string;
  lieferant_org_id: string | null;
  bezeichnung: string;
  format: string | null;
  rohbogen_id: string | null;
  druckbogen_id: string | null;
  lagerort: string | null;
  einheit: string;
  bestand: number;
  mindestbestand: number | null;
  einkaufspreis: number | null;
  quelle_bezug_id: string | null;
  nutzen: number | null;
};

export type Lieferant = { id: string; name: string };
export type Bogenformat = { id: string; code: string; name: string };

const empty: RowState = {};

function BezugRow({
  row,
  materialId,
  lieferanten,
  quellOptionen,
  rohboegen,
  druckboegen,
}: {
  row?: Bezug;
  materialId: string;
  lieferanten: Lieferant[];
  quellOptionen: Bezug[];
  rohboegen: Bogenformat[];
  druckboegen: Bogenformat[];
}) {
  const [state, action, pending] = useActionState(speichereBezug, empty);
  const [dState, dAction, dPending] = useActionState(loescheBezug, empty);
  const isNew = !row;
  const warn = row ? unterMindestbestand(row.bestand, row.mindestbestand) : false;

  return (
    <form className={isNew ? "row new" : "row"} action={action}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="material_id" value={materialId} />
      <select name="lieferant_org_id" defaultValue={row?.lieferant_org_id ?? ""} style={{ width: 140 }}>
        <option value="">– Lieferant –</option>
        {lieferanten.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <input
        className="w-name"
        name="bezeichnung"
        defaultValue={row?.bezeichnung ?? ""}
        placeholder="Bezeichnung, z.B. Juwel Offset"
        required
      />
      <select name="rohbogen_id" defaultValue={row?.rohbogen_id ?? ""} style={{ width: 100 }}>
        <option value="">– Rohbogen –</option>
        {rohboegen.map((r) => (
          <option key={r.id} value={r.id}>{r.code}</option>
        ))}
      </select>
      <select name="druckbogen_id" defaultValue={row?.druckbogen_id ?? ""} style={{ width: 100 }}>
        <option value="">– Druckbogen –</option>
        {druckboegen.map((d) => (
          <option key={d.id} value={d.id}>{d.code}</option>
        ))}
      </select>
      {row && !row.rohbogen_id && !row.druckbogen_id && row.format && (
        <span className="count" title="Altes Freitext-Format">({row.format})</span>
      )}
      <input name="lagerort" defaultValue={row?.lagerort ?? ""} placeholder="Lagerort" style={{ width: 120 }} />
      <input name="einheit" defaultValue={row?.einheit ?? "Bogen"} placeholder="Einheit" style={{ width: 70 }} />
      <input
        name="bestand"
        defaultValue={row?.bestand ?? ""}
        placeholder="Bestand"
        style={{ width: 80 }}
        inputMode="decimal"
        className={warn ? "bestand-warn" : undefined}
      />
      <input
        name="mindestbestand"
        defaultValue={row?.mindestbestand ?? ""}
        placeholder="Mindest."
        style={{ width: 80 }}
        inputMode="decimal"
      />
      <input
        name="einkaufspreis"
        defaultValue={row?.einkaufspreis ?? ""}
        placeholder="Preis"
        style={{ width: 80 }}
        inputMode="decimal"
      />
      <select name="quelle_bezug_id" defaultValue={row?.quelle_bezug_id ?? ""} style={{ width: 140 }}>
        <option value="">– geschnitten aus –</option>
        {quellOptionen
          .filter((q) => q.id !== row?.id)
          .map((q) => (
            <option key={q.id} value={q.id}>{q.bezeichnung}</option>
          ))}
      </select>
      <input name="nutzen" defaultValue={row?.nutzen ?? ""} placeholder="Nutzen" style={{ width: 64 }} inputMode="numeric" />
      {warn && <span className="bestand-warn">⚠ Mindestbestand</span>}
      <button type="submit" disabled={pending}>
        {pending ? "…" : isNew ? "Hinzufügen" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
      {row && (
        <button
          type="submit"
          className="ghost"
          formAction={dAction}
          formNoValidate
          disabled={dPending}
          onClick={(e) => {
            if (!confirm("Bezug löschen?")) e.preventDefault();
          }}
        >
          ✕
        </button>
      )}
    </form>
  );
}

export function BezuegeTable({
  materialId,
  bezuege,
  lieferanten,
  rohboegen,
  druckboegen,
}: {
  materialId: string;
  bezuege: Bezug[];
  lieferanten: Lieferant[];
  rohboegen: Bogenformat[];
  druckboegen: Bogenformat[];
}) {
  return (
    <div className="rows">
      <div className="row head">
        <span style={{ width: 140 }}>Lieferant</span>
        <span className="w-name">Bezeichnung</span>
        <span style={{ width: 100 }}>Rohbogen</span>
        <span style={{ width: 100 }}>Druckbogen</span>
        <span style={{ width: 120 }}>Lagerort</span>
        <span style={{ width: 70 }}>Einheit</span>
        <span style={{ width: 80 }}>Bestand</span>
        <span style={{ width: 80 }}>Mindest.</span>
        <span style={{ width: 80 }}>Preis</span>
        <span style={{ width: 140 }}>geschnitten aus</span>
        <span style={{ width: 64 }}>Nutzen</span>
      </div>
      {bezuege.map((b) => (
        <BezugRow
          key={b.id}
          row={b}
          materialId={materialId}
          lieferanten={lieferanten}
          quellOptionen={bezuege}
          rohboegen={rohboegen}
          druckboegen={druckboegen}
        />
      ))}
      <BezugRow
        materialId={materialId}
        lieferanten={lieferanten}
        quellOptionen={bezuege}
        rohboegen={rohboegen}
        druckboegen={druckboegen}
      />
    </div>
  );
}

export function UmbuchenForm({ materialId, quelle, ziele }: { materialId: string; quelle: Bezug; ziele: Bezug[] }) {
  const [state, action, pending] = useActionState(umbuchen, empty);
  const [zielId, setZielId] = useState(ziele[0]?.id ?? "");
  const [menge, setMenge] = useState("");

  const ziel = useMemo(() => ziele.find((z) => z.id === zielId), [ziele, zielId]);
  const mengeNum = Number(menge.replace(",", "."));
  const vorschau =
    ziel && Number.isFinite(mengeNum) && mengeNum > 0 ? umbuchungZielMenge(mengeNum, ziel.nutzen) : null;

  if (ziele.length === 0) return null;

  return (
    <form action={action} className="toolbar" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
      <input type="hidden" name="material_id" value={materialId} />
      <input type="hidden" name="quelle_id" value={quelle.id} />
      <span className="count">Umbuchen von "{quelle.bezeichnung}" nach:</span>
      <select name="ziel_id" value={zielId} onChange={(e) => setZielId(e.target.value)} style={{ width: 160 }}>
        {ziele.map((z) => (
          <option key={z.id} value={z.id}>{z.bezeichnung}</option>
        ))}
      </select>
      <input
        name="menge"
        value={menge}
        onChange={(e) => setMenge(e.target.value)}
        placeholder={`Menge (${quelle.einheit})`}
        style={{ width: 110 }}
        inputMode="decimal"
      />
      {vorschau != null && (
        <span className="count">
          → ergibt {vorschau.toLocaleString("de-DE")} {ziel?.einheit}
        </span>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Umbuchen"}
      </button>
      {state.ok && <span className="msg-ok">✓ gebucht</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
