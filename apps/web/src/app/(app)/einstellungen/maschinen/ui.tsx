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
  geladenes_papier: string | null;
  geladenes_format: string | null;
};

const empty: RowState = {};
const TYP_LABEL: Record<string, string> = {
  druck: "Drucken",
  cello: "Cellophanieren",
  binden: "Binden",
  konfektion: "Konfektion",
  sonstige: "Sonstige",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function MaschineForm({ row }: { row?: Maschine }) {
  const [state, action, pending] = useActionState(saveMaschine, empty);
  const neu = !row;
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
        <Field label="Formate (Komma)">
          <input
            name="formate"
            defaultValue={(row?.formate ?? []).join(", ")}
            placeholder="SRA3, SRA3+"
          />
        </Field>
        <Field label="geladenes Papier">
          <input
            name="geladenes_papier"
            defaultValue={row?.geladenes_papier ?? ""}
            placeholder="z. B. 170g BD glänzend"
          />
        </Field>
        <Field label="geladenes Format">
          <input
            name="geladenes_format"
            defaultValue={row?.geladenes_format ?? ""}
            placeholder="SRA3"
          />
        </Field>
        <Field label="flux-Drucker">
          <input
            name="flux_printer_name"
            defaultValue={row?.flux_printer_name ?? ""}
            placeholder="Name aus flux /printers"
          />
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

export function MaschinenTable({ rows }: { rows: Maschine[] }) {
  const gruppen = Array.from(new Set(rows.map((r) => r.typ)));
  return (
    <div>
      {gruppen.map((g) => (
        <section key={g} style={{ marginTop: 18 }}>
          <h2 style={{ marginBottom: 8 }}>{TYP_LABEL[g] ?? g}</h2>
          {rows.filter((r) => r.typ === g).map((r) => (
            <MaschineForm key={r.id} row={r} />
          ))}
        </section>
      ))}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ marginBottom: 8 }}>Neue Maschine</h2>
        <MaschineForm />
      </section>
    </div>
  );
}
