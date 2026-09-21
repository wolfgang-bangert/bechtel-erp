"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pdfSeitenzahl } from "@werk/shared/pdf/analyse";
import { presignArchivUpload, registriereArchivDatei } from "./actions";

type Status = "wartet" | "prüft" | "lädt" | "fertig" | "übersprungen" | "fehler";
type Eintrag = {
  name: string;
  ordner: string | null;
  status: Status;
  fortschritt: number;
  fehler?: string;
};

type FileMitPfad = File & { webkitRelativePath?: string };

const PARALLEL = 2;
const VERSUCHE = 3;
const MAX_ZAEHLEN = 120 * 1024 * 1024;

function ordnerVon(pfad: string): string | null {
  // webkitRelativePath beginnt mit dem gewählten Ordner selbst; bei Auswahl des
  // Elternordners ist das zweite Segment der Unterordner, bei Auswahl eines
  // Unterordners (z.B. nur "Inhalt") ist es das erste.
  const teile = pfad.split("/").filter(Boolean);
  const seg = (teile.length > 2 ? teile[1] : teile[0]).toLowerCase();
  if (seg.includes("haupt")) return "hauptregister";
  if (seg.includes("unter")) return "unterregister";
  if (seg.includes("inhalt")) return "inhalt";
  if (seg.includes("deck") || seg.includes("falt")) return "deck";
  return null;
}

function putMitFortschritt(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Speicher antwortete mit ${xhr.status}`));
    xhr.onerror = () =>
      reject(new Error("Upload blockiert oder Verbindung weg (bei sofortigem Fehler: CORS am Bucket prüfen)"));
    xhr.send(file);
  });
}

export function ArchivUpload({
  produktId,
  vorhanden,
}: {
  produktId: string;
  vorhanden: { name: string; size: number }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [laeuft, setLaeuft] = useState(false);

  const update = (i: number, patch: Partial<Eintrag>) =>
    setEintraege((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const start = async (fileList: FileList) => {
    const alle = Array.from(fileList) as FileMitPfad[];
    const pdfs = alle.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const liste: Eintrag[] = pdfs.map((f) => ({
      name: f.name.normalize("NFC"),
      ordner: ordnerVon(f.webkitRelativePath || f.name),
      status: "wartet",
      fortschritt: 0,
    }));
    setEintraege(liste);
    setLaeuft(true);

    const kennt = new Set(vorhanden.map((v) => `${v.name}|${v.size}`));
    let next = 0;

    const arbeite = async () => {
      while (next < pdfs.length) {
        const i = next++;
        const file = pdfs[i];
        const e = liste[i];
        if (!e.ordner) {
          update(i, { status: "fehler", fehler: "Ordner nicht erkannt (erwartet: Hauptregister, Unterregister, Inhalt, Deck…)" });
          continue;
        }
        if (kennt.has(`${e.name}|${file.size}`)) {
          update(i, { status: "übersprungen", fortschritt: 1 });
          continue;
        }
        try {
          update(i, { status: "prüft" });
          // Sehr große Dateien (z.B. 400+ MB) nicht komplett in den Browser-Speicher
          // laden, nur um Seiten zu zählen - Seitenzahl bleibt dann leer.
          const seitenzahl =
            file.size > MAX_ZAEHLEN ? null : await pdfSeitenzahl(new Uint8Array(await file.arrayBuffer()));
          const ipKey = e.name.match(/^IP_(\d+[a-z]?)_/i)?.[1]?.toLowerCase() ?? null;

          let letzterFehler = "";
          let geschafft = false;
          for (let versuch = 1; versuch <= VERSUCHE && !geschafft; versuch++) {
            update(i, { status: "lädt", fortschritt: 0, fehler: versuch > 1 ? `Versuch ${versuch}` : undefined });
            const p = await presignArchivUpload(produktId);
            if ("error" in p) {
              letzterFehler = p.error;
              continue;
            }
            try {
              await putMitFortschritt(p.url, file, (f) => update(i, { fortschritt: f }));
              const r = await registriereArchivDatei(produktId, {
                key: p.key,
                name: e.name,
                size: file.size,
                ordner: e.ordner,
                ipKey,
                seitenzahl,
              });
              if ("error" in r) {
                letzterFehler = r.error;
                break; // Fachfehler (z.B. doppelt) - Wiederholen bringt nichts
              }
              geschafft = true;
            } catch (err) {
              letzterFehler = err instanceof Error ? err.message : "Upload fehlgeschlagen";
            }
          }
          update(
            i,
            geschafft
              ? { status: "fertig", fortschritt: 1, fehler: undefined }
              : { status: "fehler", fehler: letzterFehler },
          );
        } catch (err) {
          update(i, { status: "fehler", fehler: err instanceof Error ? err.message : "Fehler" });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(PARALLEL, pdfs.length) }, arbeite));
    setLaeuft(false);
    router.refresh();
  };

  const zaehle = (s: Status) => eintraege.filter((e) => e.status === s).length;

  return (
    <div className="rows" style={{ gap: 10 }}>
      <div className="toolbar" style={{ gap: 8 }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={laeuft}
          // @ts-expect-error -- webkitdirectory ist nicht Teil des React-Typs, wird aber von allen gängigen Browsern unterstützt
          webkitdirectory=""
          onChange={(e) => e.target.files && start(e.target.files)}
        />
        {eintraege.length > 0 && (
          <span className="count">
            {zaehle("fertig")} hochgeladen · {zaehle("übersprungen")} schon vorhanden · {zaehle("fehler")} Fehler ·{" "}
            {eintraege.length} gesamt
          </span>
        )}
      </div>
      <p className="count" style={{ marginTop: -4 }}>
        Ordner mit den Unterordnern Hauptregister, Unterregister, Inhalt und Deck- und Faltblätter wählen (oder einen
        einzelnen davon). Bereits vorhandene Dateien werden übersprungen, ein Abbruch lässt sich durch erneutes Wählen
        fortsetzen. Den Tab dabei offen lassen.
      </p>
      {eintraege.length > 0 && (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Datei</th>
                <th>Ordner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {eintraege
                .map((e, i) => ({ e, i }))
                .filter(({ e }) => e.status !== "übersprungen")
                .map(({ e, i }) => (
                  <tr key={i}>
                    <td>{e.name}</td>
                    <td className="count">{e.ordner ?? "?"}</td>
                    <td className={e.status === "fehler" ? "msg-err" : "count"}>
                      {e.status === "lädt" ? `${Math.round(e.fortschritt * 100)} %` : e.status}
                      {e.fehler ? ` – ${e.fehler}` : ""}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
