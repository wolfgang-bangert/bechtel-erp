"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  uploadPdfsAction,
  deleteTempPdfsAction,
  type UploadState,
  type DeleteState,
  type HochgeladeneDatei,
} from "./actions";

const emptyUpload: UploadState = {};
const emptyDelete: DeleteState = {};

type Eintrag = { id: string; dateiIndex: number; seite: number };

export function PdfSeitenForm() {
  const [upload, uploadAction, uploadPending] = useActionState(uploadPdfsAction, emptyUpload);
  const [del, deleteAction, deletePending] = useActionState(deleteTempPdfsAction, emptyDelete);

  const [dateien, setDateien] = useState<HochgeladeneDatei[]>([]);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [downloadFehler, setDownloadFehler] = useState<string | null>(null);
  const [downloadPending, setDownloadPending] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Neu hochgeladene Dateien an die bestehende Liste anhängen, nicht ersetzen
  // (Mehrfach-Merge - jeder Upload kommt zu den schon vorhandenen dazu).
  useEffect(() => {
    if (!upload.ok || !upload.dateien) return;
    setDateien((prev) => {
      const startIndex = prev.length;
      const neu = [...prev, ...upload.dateien!];
      setEintraege((prevEintraege) => [
        ...prevEintraege,
        ...upload.dateien!.flatMap((d, di) =>
          Array.from({ length: d.pageCount }, (_, si) => ({
            id: `${startIndex + di}-${si + 1}-${Math.random().toString(36).slice(2, 8)}`,
            dateiIndex: startIndex + di,
            seite: si + 1,
          })),
        ),
      ]);
      return neu;
    });
    formRef.current?.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload]);

  const alleZuruecksetzen = () => {
    setDateien([]);
    setEintraege([]);
  };

  if (del.ok) {
    return (
      <p className="msg-ok">
        ✓ Temporäre Dateien gelöscht.{" "}
        <a href="/werkzeuge/pdf-seiten-verwalten" style={{ marginLeft: 4 }}>
          Neu anfangen
        </a>
      </p>
    );
  }

  const entfernen = (id: string) => setEintraege((e) => e.filter((x) => x.id !== id));

  const bewegen = (index: number, richtung: -1 | 1) => {
    setEintraege((e) => {
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= e.length) return e;
      const kopie = e.slice();
      [kopie[index], kopie[ziel]] = [kopie[ziel], kopie[index]];
      return kopie;
    });
  };

  const onDrop = (zielIndex: number) => {
    setEintraege((e) => {
      const von = dragIndex.current;
      if (von === null || von === zielIndex) return e;
      const kopie = e.slice();
      const [entfernt] = kopie.splice(von, 1);
      kopie.splice(zielIndex, 0, entfernt);
      return kopie;
    });
    dragIndex.current = null;
  };

  const herunterladen = async () => {
    setDownloadFehler(null);
    setDownloadPending(true);
    try {
      const res = await fetch("/api/pdf-seiten-verwalten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: dateien.map((d) => d.key),
          reihenfolge: eintraege.map((e) => ({ dateiIndex: e.dateiIndex, seite: e.seite })),
        }),
      });
      if (!res.ok) {
        setDownloadFehler(await res.text());
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zusammengestellt.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadFehler(e instanceof Error ? e.message : "Download fehlgeschlagen.");
    } finally {
      setDownloadPending(false);
    }
  };

  return (
    <div className="rows" style={{ gap: 20, maxWidth: 900 }}>
      <form ref={formRef} action={uploadAction} className="toolbar" style={{ gap: 8 }}>
        <input type="file" name="files" accept="application/pdf" multiple required />
        <button type="submit" disabled={uploadPending} style={{ padding: "7px 14px" }}>
          {uploadPending ? "…" : dateien.length > 0 ? "Weitere Datei(en) hinzufügen" : "Hochladen"}
        </button>
        {upload.error && <span className="msg-err">{upload.error}</span>}
      </form>

      {dateien.length > 0 && (
        <>
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <span className="count">
              {dateien.length} {dateien.length === 1 ? "Datei" : "Dateien"} · {eintraege.length}{" "}
              {eintraege.length === 1 ? "Seite" : "Seiten"} ausgewählt
            </span>
            <div className="toolbar" style={{ margin: 0, gap: 8 }}>
              <button
                type="button"
                className="ghost"
                onClick={alleZuruecksetzen}
                style={{ padding: "5px 10px" }}
              >
                Von vorn beginnen
              </button>
              <form action={deleteAction}>
                <input type="hidden" name="keys" value={JSON.stringify(dateien.map((d) => d.key))} />
                <button type="submit" className="ghost" disabled={deletePending} style={{ padding: "5px 10px" }}>
                  {deletePending ? "…" : "Dateien löschen"}
                </button>
              </form>
            </div>
          </div>
          {del.error && <div className="msg-err">{del.error}</div>}

          <p className="count" style={{ marginTop: -8 }}>
            Zeile ziehen zum Umsortieren, oder die Pfeile/× benutzen. Vorschau öffnet die ganze
            Quelldatei (keine einzelnen Seitenbilder).
          </p>

          <div className="rows" style={{ gap: 4 }}>
            {eintraege.map((e, i) => {
              const datei = dateien[e.dateiIndex];
              return (
                <div
                  key={e.id}
                  className="row"
                  draggable
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => onDrop(i)}
                  style={{ gap: 10, alignItems: "center", cursor: "grab" }}
                >
                  <span className="count" style={{ width: 28, textAlign: "right" }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong>{datei?.fileName}</strong>{" "}
                    <span className="count">
                      · Seite {e.seite} von {datei?.pageCount}
                    </span>
                  </span>
                  {datei?.previewUrl && (
                    <a href={datei.previewUrl} target="_blank" rel="noreferrer" className="count">
                      Vorschau
                    </a>
                  )}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => bewegen(i, -1)}
                    disabled={i === 0}
                    title="Nach oben"
                    style={{ padding: "2px 8px" }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => bewegen(i, 1)}
                    disabled={i === eintraege.length - 1}
                    title="Nach unten"
                    style={{ padding: "2px 8px" }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => entfernen(e.id)}
                    title="Seite entfernen"
                    style={{ padding: "2px 8px" }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {eintraege.length === 0 && <p className="count">Alle Seiten entfernt.</p>}
          </div>

          <div className="toolbar">
            <button
              type="button"
              onClick={herunterladen}
              disabled={downloadPending || eintraege.length === 0}
              style={{ padding: "8px 16px" }}
            >
              {downloadPending ? "…" : "Zusammengestelltes PDF herunterladen"}
            </button>
            {downloadFehler && <span className="msg-err">{downloadFehler}</span>}
          </div>
        </>
      )}
    </div>
  );
}
