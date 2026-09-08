"use client";

import { useActionState } from "react";
import { saveMaschine, type RowState } from "./actions";

export type Maschine = {
  id: string;
  name: string;
  typ: string;
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

const empty: RowState = {};
const TYP_LABEL: Record<string, string> = {
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

function MaschineForm({ row, printers }: { row?: Maschine; printers: string[] }) {
  const [state, action, pending] = useActionState(saveMaschine, empty);
  const neu = !row;
  const printerVal = row?.flux_printer_name ?? "";
  const printerListId = `flux-printers-${row?.id ?? "neu"}`;
  const geladenText = (row?.geladen ?? [])
    .map((g) => `${g.papier ?? ""}${g.format ? ` | ${g.format}` : ""}`)
    .join("\n");

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
        {state.ok && <span className="msg-ok">✓ {neu ? "angelegt" : "gespeichert"}</span>}
        {state.error && <span className="msg-err">{state.error}</span>}
      </div>
    </form>
  );
}

export function MaschinenTable({
  rows,
  printers,
  catalogError,
}: {
  rows: Maschine[];
  printers: string[];
  catalogError?: string;
}) {
  const gruppen = Array.from(new Set(rows.map((r) => r.typ)));
  return (
    <div>
      <p className="count" style={{ marginTop: -4 }}>
        {catalogError
          ? `flux-Drucker konnten nicht geladen werden: ${catalogError}`
          : `${printers.length} flux-Drucker aus der API`}
      </p>
      {gruppen.map((g) => (
        <section key={g} style={{ marginTop: 18 }}>
          <h2 style={{ marginBottom: 8 }}>{TYP_LABEL[g] ?? g}</h2>
          {rows.filter((r) => r.typ === g).map((r) => (
            <MaschineForm key={r.id} row={r} printers={printers} />
          ))}
        </section>
      ))}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ marginBottom: 8 }}>Neue Maschine</h2>
        <MaschineForm printers={printers} />
      </section>
    </div>
  );
}
