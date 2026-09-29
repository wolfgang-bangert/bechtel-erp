"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveMaschine, type RowState } from "./actions";
import { FaehigkeitenEditor, type Faehigkeit } from "./FaehigkeitenEditor";

export type Maschine = {
  id: string;
  name: string;
  typ: string;
  nummer: string | null;
  cost_center_id: string | null;
  flux_printer_name: string | null;
  farbe: string | null;
  kapazitaet_bogen_h: number | null;
  sortierung: number;
  aktiv: boolean;
  druckverfahren: string | null;
  max_farben: number | null;
  formate: string[] | null;
  geladen: { papier: string | null; format: string | null }[] | null;
};

export type CostCenterOption = { id: string; label: string };

const empty: RowState = {};
export const TYP_LABEL: Record<string, string> = {
  druck: "Drucken",
  cello: "Cellophanieren",
  binden: "Binden",
  konfektion: "Konfektion",
  sonstige: "Sonstige",
};

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        fontSize: 12,
        gridColumn: wide ? "1 / -1" : undefined,
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  );
}

/** Vollständiges Formular für eine Maschine - auf der Detailseite (bestehende
 *  Maschine) oder unter /neu (Anlage). Springt nach erfolgreicher Neuanlage
 *  automatisch auf die Detailseite der neuen Maschine. */
export function MaschineForm({
  row,
  printers,
  costCenters,
}: {
  row?: Maschine;
  printers: string[];
  costCenters: CostCenterOption[];
}) {
  const [state, action, pending] = useActionState(saveMaschine, empty);
  const router = useRouter();
  const neu = !row;
  const printerVal = row?.flux_printer_name ?? "";
  const printerListId = `flux-printers-${row?.id ?? "neu"}`;
  const geladenText = (row?.geladen ?? [])
    .map((g) => `${g.papier ?? ""}${g.format ? ` | ${g.format}` : ""}`)
    .join("\n");

  useEffect(() => {
    if (neu && state.ok && state.id) router.push(`/einstellungen/maschinen/${state.id}`);
  }, [neu, state.ok, state.id, router]);

  return (
    <form
      action={action}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        borderLeft: `4px solid ${row?.farbe ?? "var(--accent)"}`,
        padding: 12,
        marginBottom: 10,
        background: neu ? "var(--bg)" : "var(--panel)",
      }}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <Field label="Name">
          <input name="name" defaultValue={row?.name} placeholder="Name" required />
        </Field>
        <Field label="Gruppe / Typ">
          <select name="typ" defaultValue={row?.typ ?? "druck"}>
            {Object.entries(TYP_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Maschinen-/Gerätenummer">
          <input name="nummer" defaultValue={row?.nummer ?? ""} placeholder="z.B. 20001" />
        </Field>
        <Field label="Kostenstelle">
          <select name="cost_center_id" defaultValue={row?.cost_center_id ?? ""}>
            <option value="">— keine —</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Druckverfahren">
          <select name="druckverfahren" defaultValue={row?.druckverfahren ?? ""}>
            <option value="">–</option>
            <option value="digital">Digitaldruck (flux)</option>
            <option value="offset">Offset</option>
          </select>
        </Field>
        <Field label="max. Farben (1 / 4)">
          <input
            name="max_farben"
            type="number"
            min={1}
            max={8}
            defaultValue={row?.max_farben ?? ""}
            placeholder="4"
          />
        </Field>
        <Field label="Formate – Kapazität (Komma)">
          <input
            name="formate"
            defaultValue={(row?.formate ?? []).join(", ")}
            placeholder="SRA3, SRA3+"
          />
        </Field>
        <Field label="flux-Drucker">
          <input
            name="flux_printer_name"
            defaultValue={printerVal}
            list={printers.length ? printerListId : undefined}
            placeholder="Name aus flux /printers"
            autoComplete="off"
          />
          {printers.length > 0 && (
            <datalist id={printerListId}>
              {printers.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          )}
        </Field>
        <Field label="Bogen / h">
          <input
            name="kapazitaet_bogen_h"
            type="number"
            defaultValue={row?.kapazitaet_bogen_h ?? ""}
          />
        </Field>
        <Field label="Board-Farbe">
          <input
            type="color"
            name="farbe"
            defaultValue={row?.farbe ?? "#2f6feb"}
            style={{ width: 48, height: 30, padding: 2 }}
          />
        </Field>
        <Field label="Reihenfolge">
          <input name="sortierung" type="number" defaultValue={row?.sortierung ?? 100} />
        </Field>
        <Field label="geladene Materialien – Rüstzustand, je Zeile: Papier | Format (max. 9)" wide>
          <textarea
            name="geladen"
            defaultValue={geladenText}
            rows={4}
            placeholder={"170g BD glänzend | SRA3\n300g BD matt | SRA3+"}
            style={{ fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>
      </div>
      <div className="toolbar" style={{ gap: 10, marginTop: 10, alignItems: "center" }}>
        <label className="chk">
          <input type="checkbox" name="aktiv" defaultChecked={row?.aktiv ?? true} /> aktiv
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "…" : neu ? "Maschine anlegen" : "Speichern"}
        </button>
        {state.ok && !neu && <span className="msg-ok">✓ gespeichert</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}

/** Detailseite: Stammdaten-Formular + Fähigkeiten der Maschine. */
export function MaschineDetail({
  row,
  printers,
  costCenters,
  faehigkeiten,
  werte,
}: {
  row: Maschine;
  printers: string[];
  costCenters: CostCenterOption[];
  faehigkeiten: Faehigkeit[];
  werte: Record<string, unknown>;
}) {
  return (
    <div>
      <MaschineForm row={row} printers={printers} costCenters={costCenters} />
      <FaehigkeitenEditor maschineId={row.id} typ={row.typ} katalog={faehigkeiten} werte={werte} />
    </div>
  );
}

/** Übersicht: schlanke Liste (Name, Gruppe, Nummer, Kostenstelle) - Details
 *  und Fähigkeiten stehen auf der jeweiligen Detailseite. */
export function MaschinenListTable({
  rows,
  costCenterLabel,
}: {
  rows: Maschine[];
  costCenterLabel: Map<string, string>;
}) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Gruppe</th>
            <th>Nummer</th>
            <th>Kostenstelle</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ opacity: r.aktiv ? 1 : 0.55 }}>
              <td>
                <Link href={`/einstellungen/maschinen/${r.id}`}>{r.name}</Link>
              </td>
              <td>{TYP_LABEL[r.typ] ?? r.typ}</td>
              <td className="count">{r.nummer ?? "–"}</td>
              <td className="count">
                {r.cost_center_id ? (costCenterLabel.get(r.cost_center_id) ?? "–") : "–"}
              </td>
              <td>
                <span className="tag">{r.aktiv ? "aktiv" : "inaktiv"}</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "var(--muted)" }}>
                Noch keine Maschinen angelegt.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
