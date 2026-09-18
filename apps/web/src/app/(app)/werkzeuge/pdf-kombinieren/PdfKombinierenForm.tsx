"use client";

import { useActionState, useEffect, useState } from "react";
import { uploadPdfAction, deleteTempPdfAction, type UploadState, type DeleteState } from "./actions";

const emptyUpload: UploadState = {};
const emptyDelete: DeleteState = {};

export function PdfKombinierenForm() {
  const [upload, uploadAction, uploadPending] = useActionState(uploadPdfAction, emptyUpload);
  const [del, deleteAction, deletePending] = useActionState(deleteTempPdfAction, emptyDelete);

  const meta = upload.metadaten;
  const pageCount = meta?.pageCount ?? 0;
  const [links, setLinks] = useState(1);
  const [rechts, setRechts] = useState(1);

  // Sinnvolle Defaults, sobald die Seitenzahl bekannt ist: erste + letzte
  // Seite - genau der Umschlag/Deckblatt-Fall, für den das Tool gebaut wurde.
  useEffect(() => {
    if (pageCount > 0) {
      setLinks(1);
      setRechts(pageCount);
    }
  }, [pageCount]);

  const gueltig =
    !!upload.key &&
    pageCount > 0 &&
    Number.isInteger(links) &&
    Number.isInteger(rechts) &&
    links >= 1 &&
    links <= pageCount &&
    rechts >= 1 &&
    rechts <= pageCount;

  const downloadHref = upload.key
    ? `/api/pdf-kombinieren?key=${encodeURIComponent(upload.key)}&links=${links}&rechts=${rechts}`
    : "#";

  if (del.ok) {
    // Datei gelöscht - zurück auf den Ausgangszustand.
    return (
      <p className="msg-ok">
        ✓ Temporäre Datei gelöscht.{" "}
        <a href="/werkzeuge/pdf-kombinieren" style={{ marginLeft: 4 }}>
          Neue Datei hochladen
        </a>
      </p>
    );
  }

  return (
    <div className="rows" style={{ gap: 20, maxWidth: 900 }}>
      {!upload.ok && (
        <form action={uploadAction} className="toolbar" style={{ gap: 8 }}>
          <input type="file" name="file" accept="application/pdf" required />
          <button type="submit" disabled={uploadPending} style={{ padding: "7px 14px" }}>
            {uploadPending ? "…" : "Hochladen"}
          </button>
          {upload.error && <span className="msg-err">{upload.error}</span>}
        </form>
      )}

      {upload.ok && (
        <>
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{upload.fileName}</strong>{" "}
              <span className="count">
                · {pageCount} {pageCount === 1 ? "Seite" : "Seiten"}
              </span>
            </span>
            <form action={deleteAction}>
              <input type="hidden" name="key" value={upload.key} />
              <button type="submit" className="ghost" disabled={deletePending} style={{ padding: "5px 10px" }}>
                {deletePending ? "…" : "Datei löschen"}
              </button>
            </form>
          </div>
          {del.error && <div className="msg-err">{del.error}</div>}

          {meta && (
            <>
              {(meta.titel || meta.autor || meta.ersteller || meta.produzent || meta.erstelltAm || meta.geaendertAm) && (
                <dl className="kv">
                  {meta.titel && (
                    <>
                      <dt>Titel</dt>
                      <dd>{meta.titel}</dd>
                    </>
                  )}
                  {meta.autor && (
                    <>
                      <dt>Autor</dt>
                      <dd>{meta.autor}</dd>
                    </>
                  )}
                  {meta.ersteller && (
                    <>
                      <dt>Ersteller (Creator)</dt>
                      <dd>{meta.ersteller}</dd>
                    </>
                  )}
                  {meta.produzent && (
                    <>
                      <dt>Produzent</dt>
                      <dd>{meta.produzent}</dd>
                    </>
                  )}
                  {meta.erstelltAm && (
                    <>
                      <dt>Erstellt am</dt>
                      <dd>{new Date(meta.erstelltAm).toLocaleString("de-DE")}</dd>
                    </>
                  )}
                  {meta.geaendertAm && (
                    <>
                      <dt>Geändert am</dt>
                      <dd>{new Date(meta.geaendertAm).toLocaleString("de-DE")}</dd>
                    </>
                  )}
                </dl>
              )}

              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Seite</th>
                      <th>TrimBox (Endformat)</th>
                      <th>MediaBox</th>
                      <th>CropBox</th>
                      <th>BleedBox</th>
                      <th>ArtBox</th>
                      <th>Rotation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meta.seiten.map((s) => (
                      <tr key={s.seite} className={s.seite === links || s.seite === rechts ? "gruppen-zeile" : undefined}>
                        <td>
                          {s.seite}
                          {s.seite === links && " ← links"}
                          {s.seite === rechts && " ← rechts"}
                        </td>
                        <td>
                          <strong>
                            {s.trimBox.breiteMm} × {s.trimBox.hoeheMm} mm
                          </strong>
                          <span className="count"> ({s.trimBox.breitePt} × {s.trimBox.hoehePt} pt)</span>
                        </td>
                        <td className="count">
                          {s.mediaBox.breiteMm} × {s.mediaBox.hoeheMm} mm
                        </td>
                        <td className="count">
                          {s.cropBox.breiteMm} × {s.cropBox.hoeheMm} mm
                        </td>
                        <td className="count">
                          {s.bleedBox.breiteMm} × {s.bleedBox.hoeheMm} mm
                        </td>
                        <td className="count">
                          {s.artBox.breiteMm} × {s.artBox.hoeheMm} mm
                        </td>
                        <td className="count">{s.rotation}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {upload.previewUrl && (
            <iframe
              src={upload.previewUrl}
              title="PDF-Vorschau"
              style={{
                width: "100%",
                height: 480,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }}
            />
          )}

          <div className="toolbar" style={{ gap: 16, alignItems: "flex-end" }}>
            <label className="rows" style={{ gap: 4 }}>
              <span className="count">Linke Seite (1-{pageCount})</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={links}
                onChange={(e) => setLinks(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <label className="rows" style={{ gap: 4 }}>
              <span className="count">Rechte Seite (1-{pageCount})</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={rechts}
                onChange={(e) => setRechts(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <a
              href={downloadHref}
              aria-disabled={!gueltig}
              style={{
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: 6,
                background: "var(--accent)",
                color: "var(--accent-text)",
                textDecoration: "none",
                pointerEvents: gueltig ? "auto" : "none",
                opacity: gueltig ? 1 : 0.5,
              }}
            >
              Kombiniertes PDF herunterladen
            </a>
          </div>
          {!gueltig && (
            <p className="count">Bitte gültige Seitenzahlen zwischen 1 und {pageCount} wählen.</p>
          )}
        </>
      )}
    </div>
  );
}
