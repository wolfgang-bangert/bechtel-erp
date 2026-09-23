"use client";

import { useActionState, useEffect, useState } from "react";
import { saveKapitel, saveProduktteil, type RowState } from "./actions";

export type MaterialOpt = { id: string; label: string };

export type TeilDatei = { id: string; filename: string; url: string | null; quelle: string | null };

export type Teil = {
  id: string;
  typLabel: string;
  nr: string | null;
  titel: string | null;
  material_id: string | null;
  farbigkeit: string | null;
  seitenzahl: number | null;
  registerText: string | null;
  dateien: TeilDatei[];
  ips: string[];
};

const empty: RowState = {};

function TeilDetailModal({
  produktId,
  teil,
  materialien,
  onClose,
}: {
  produktId: string;
  teil: Teil;
  materialien: MaterialOpt[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveProduktteil, empty);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 20,
          width: 560,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            {teil.typLabel} {teil.nr && <span className="count">{teil.nr}</span>}
          </h2>
          <button type="button" className="ghost" onClick={onClose} style={{ padding: "4px 10px" }}>
            ✕
          </button>
        </div>

        <form action={action} className="rows" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={teil.id} />
          <input type="hidden" name="produkt_id" value={produktId} />

          <label className="rows" style={{ gap: 2 }}>
            <span className="count">Titel</span>
            <input name="titel" defaultValue={teil.titel ?? ""} />
          </label>
          <label className="rows" style={{ gap: 2 }}>
            <span className="count">Material</span>
            <select name="material_id" defaultValue={teil.material_id ?? ""}>
              <option value="">– Material –</option>
              {materialien.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="rows" style={{ gap: 2, maxWidth: 100 }}>
            <span className="count">Farbigkeit</span>
            <input name="farbigkeit" defaultValue={teil.farbigkeit ?? ""} placeholder="4/4" />
          </label>

          <div className="toolbar" style={{ gap: 16 }}>
            {teil.seitenzahl != null && <span className="count">{teil.seitenzahl} Seiten</span>}
            {teil.registerText && <span className="count">{teil.registerText}</span>}
          </div>

          <div className="toolbar" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            {state.error && <span className="msg-err">{state.error}</span>}
            <button type="submit" disabled={pending}>
              {pending ? "…" : "Speichern"}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 14 }}>
          <div className="count" style={{ marginBottom: 6 }}>
            Dateien
          </div>
          {teil.dateien.length === 0 ? (
            <p className="count">
              Keine Datei{teil.ips.length > 0 && <> · geplant: {teil.ips.map((ip) => `IP ${ip}`).join(", ")}</>}
            </p>
          ) : (
            teil.dateien.map((d) => (
              <div key={d.id} style={{ marginBottom: 12 }}>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    {d.filename}
                  </a>
                ) : (
                  <span>{d.filename}</span>
                )}
                {d.url && (
                  <iframe
                    src={d.url}
                    title={d.filename}
                    style={{
                      display: "block",
                      width: "100%",
                      height: 360,
                      marginTop: 4,
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                    }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function TeilZeile({
  produktId,
  teil,
  materialien,
}: {
  produktId: string;
  teil: Teil;
  materialien: MaterialOpt[];
}) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <div
        className="row"
        style={{ cursor: "pointer", alignItems: "center" }}
        onClick={() => setOffen(true)}
      >
        <span className="tag" style={{ minWidth: 92, textAlign: "center" }}>
          {teil.typLabel}
        </span>
        <span style={{ width: 60 }} className="count">
          {teil.nr ?? "—"}
        </span>
        <span className="w-name">{teil.titel || "—"}</span>
        {teil.dateien.length > 0 && (
          <span className="count" title={teil.dateien.map((d) => d.filename).join(", ")}>
            📄 {teil.dateien.length}
          </span>
        )}
        {teil.material_id && <span className="count">{materialien.find((m) => m.id === teil.material_id)?.label}</span>}
        {teil.farbigkeit && <span className="tag">{teil.farbigkeit}</span>}
      </div>
      {offen && (
        <TeilDetailModal produktId={produktId} teil={teil} materialien={materialien} onClose={() => setOffen(false)} />
      )}
    </>
  );
}

export function KapitelName({
  produktId,
  kapitelId,
  name,
}: {
  produktId: string;
  kapitelId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(saveKapitel, empty);
  return (
    <form className="row" action={action} style={{ borderBottom: "none", padding: "2px 0" }}>
      <input type="hidden" name="id" value={kapitelId} />
      <input type="hidden" name="produkt_id" value={produktId} />
      <span className="count" style={{ width: 70 }}>
        Kapitelname
      </span>
      <input name="name" defaultValue={name} className="w-name" required />
      <button type="submit" className="ghost" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}
