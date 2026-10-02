"use client";

import { useEffect, useState } from "react";

export type DateiRow = {
  id: string;
  typ: string;
  filename: string | null;
  bytes: number | null;
  is_zip: boolean;
  fetched_at: string | null;
  viewUrl: string | null;
  downloadUrl: string | null;
};

const TYP_LABEL: Record<string, string> = {
  printData: "Druckdaten",
  printDataPart: "Druckdaten-Teil",
  jobSheet: "Jobsheet",
  thumbnail: "Vorschau",
  partThumbnail: "Vorschau (Teil)",
  deliveryNoteLabel: "Lieferschein-Label",
  shippingLabel: "Versand-Label",
};

const isBildTyp = (typ: string) => typ === "thumbnail" || typ === "partThumbnail";

function kb(b: number | null) {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function DateienPanel({ files }: { files: DateiRow[] }) {
  const [open, setOpen] = useState<DateiRow | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="table-scroll">
        <table className="bd-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Datei</th>
              <th className="bd-num">Größe</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => {
              const isImg = isBildTyp(f.typ);
              return (
                <tr key={f.id} style={{ opacity: f.viewUrl ? 1 : 0.55 }}>
                  <td>
                    {f.typ === "printDataPart" && <span style={{ color: "var(--bd-ink-muted)" }}>↳ </span>}
                    {TYP_LABEL[f.typ] ?? f.typ}
                    {f.is_zip && <span className="bd-count" style={{ marginLeft: 6 }}>ZIP</span>}
                  </td>
                  <td className="wrap">{f.filename ?? "—"}</td>
                  <td className="bd-num">{kb(f.bytes)}</td>
                  <td className="bd-mute">{f.fetched_at ? "geholt" : "nicht geholt"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {f.viewUrl ? (
                      <>
                        <button
                          type="button"
                          className="bd-btn bd-btn-secondary bd-btn-sm"
                          onClick={() => setOpen(f)}
                          style={{ marginRight: 6 }}
                        >
                          Vorschau
                        </button>
                        <a
                          className="bd-btn bd-btn-secondary bd-btn-sm"
                          href={f.viewUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginRight: 6 }}
                        >
                          {isImg ? "Öffnen" : "Öffnen / Drucken"}
                        </a>
                        {f.downloadUrl && (
                          <a
                            className="bd-btn bd-btn-secondary bd-btn-sm"
                            href={f.downloadUrl}
                          >
                            Download
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="bd-mute">wird beim nächsten Abruf geholt</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!files.length && (
              <tr>
                <td colSpan={5} className="bd-mute">
                  Keine Dateien.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            padding: "3vh 3vw",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bd-paper)",
              border: "1px solid var(--bd-line)",
              borderRadius: "var(--bd-radius-md)",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              className="bd-section-head"
              style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd-line)", marginBottom: 0 }}
            >
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {open.filename ?? TYP_LABEL[open.typ] ?? open.typ}
              </strong>
              <div className="bd-actions">
                <a className="bd-btn bd-btn-secondary bd-btn-sm" href={open.viewUrl ?? "#"} target="_blank" rel="noreferrer">
                  {isBildTyp(open.typ) ? "Öffnen" : "Öffnen / Drucken"}
                </a>
                {open.downloadUrl && (
                  <a className="bd-btn bd-btn-secondary bd-btn-sm" href={open.downloadUrl}>
                    Download
                  </a>
                )}
                <button type="button" className="bd-btn bd-btn-primary bd-btn-sm" onClick={() => setOpen(null)}>
                  Schließen
                </button>
              </div>
            </div>
            <div style={{ flex: 1, background: "var(--bd-surface-100)" }}>
              {isBildTyp(open.typ) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={open.viewUrl ?? ""}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <iframe
                  src={open.viewUrl ?? ""}
                  title={open.filename ?? "PDF"}
                  style={{ width: "100%", height: "100%", border: 0 }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
