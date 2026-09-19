"use client";

import { useMemo, useRef, useState } from "react";
import { analysiereDatei } from "@werk/shared/pdf/analyse";

type DateiErgebnis = {
  name: string;
  kategorie: string;
  pageCount: number;
  farbig: number;
  sw: number;
  bilderUngeprueft: number;
  fehler?: string;
};

/** Webkit-Erweiterung von File, die den relativen Pfad bei Ordner-Uploads
 *  trägt - im DOM-Typ nicht enthalten, aber von allen gängigen Browsern
 *  gesetzt, sobald <input webkitdirectory> benutzt wird. */
type FileMitPfad = File & { webkitRelativePath?: string };

function kategorieVon(pfad: string): string {
  // webkitRelativePath beginnt immer mit dem Namen des ausgewählten Ordners
  // selbst (z.B. "Preisliste_italienisch/Inhalt/datei.pdf") - das zweite
  // Segment ist der eigentliche Unterordner ("Inhalt").
  const teile = pfad.split("/").filter(Boolean);
  return teile.length > 2 ? teile[1] : "(Hauptordner)";
}

const KONKURRENZ = 3;

export function PreislistenAnalyseForm() {
  const [ergebnisse, setErgebnisse] = useState<DateiErgebnis[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState({ fertig: 0, gesamt: 0 });
  const [uebersprungen, setUebersprungen] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const gruppen = useMemo(() => {
    const map = new Map<string, DateiErgebnis[]>();
    for (const e of ergebnisse) {
      if (!map.has(e.kategorie)) map.set(e.kategorie, []);
      map.get(e.kategorie)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "de"));
  }, [ergebnisse]);

  const gesamt = useMemo(
    () =>
      ergebnisse.reduce(
        (acc, e) => ({
          dateien: acc.dateien + 1,
          seiten: acc.seiten + e.pageCount,
          farbig: acc.farbig + e.farbig,
          sw: acc.sw + e.sw,
          bilder: acc.bilder + e.bilderUngeprueft,
          fehler: acc.fehler + (e.fehler ? 1 : 0),
        }),
        { dateien: 0, seiten: 0, farbig: 0, sw: 0, bilder: 0, fehler: 0 },
      ),
    [ergebnisse],
  );

  const ordnerWaehlen = async (fileList: FileList) => {
    const alle = Array.from(fileList) as FileMitPfad[];
    const pdfs = alle.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    setUebersprungen(alle.length - pdfs.length);
    setErgebnisse([]);
    setLaeuft(true);
    setFortschritt({ fertig: 0, gesamt: pdfs.length });

    const gesammelt: DateiErgebnis[] = [];
    let index = 0;
    const worker = async () => {
      while (index < pdfs.length) {
        const i = index++;
        const file = pdfs[i];
        const kategorie = kategorieVon(file.webkitRelativePath || file.name);
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const r = await analysiereDatei(bytes);
          gesammelt.push({ name: file.name, kategorie, ...r });
        } catch (e) {
          gesammelt.push({
            name: file.name,
            kategorie,
            pageCount: 0,
            farbig: 0,
            sw: 0,
            bilderUngeprueft: 0,
            fehler: e instanceof Error ? e.message : "Konnte nicht gelesen werden.",
          });
        }
        setFortschritt((f) => ({ ...f, fertig: f.fertig + 1 }));
        setErgebnisse([...gesammelt]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(KONKURRENZ, pdfs.length) }, worker));
    setLaeuft(false);
  };

  return (
    <div className="rows" style={{ gap: 20 }}>
      <div className="toolbar" style={{ gap: 8 }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          // @ts-expect-error -- webkitdirectory ist nicht Teil des React-Typs, wird aber von allen gängigen Browsern unterstützt
          webkitdirectory=""
          onChange={(e) => e.target.files && ordnerWaehlen(e.target.files)}
        />
        {laeuft && (
          <span className="count">
            Analysiere … {fortschritt.fertig} / {fortschritt.gesamt}
          </span>
        )}
      </div>
      <p className="count" style={{ marginTop: -12 }}>
        Läuft komplett im Browser - die Dateien werden nicht hochgeladen. Kategorie = oberster
        Unterordner des ausgewählten Verzeichnisses (z. B. "Hauptregister", "Inhalt").
        {uebersprungen > 0 && ` ${uebersprungen} Nicht-PDF-Datei(en) übersprungen.`}
      </p>

      {ergebnisse.length > 0 && (
        <>
          <div className="kv" style={{ gridTemplateColumns: "auto auto auto auto auto auto" }}>
            <dt>Dateien</dt>
            <dt>Seiten</dt>
            <dt>farbig (sicher)</dt>
            <dt>s/w (sicher)</dt>
            <dt>Bilder (ungeprüft)</dt>
            <dt>Fehler</dt>
            <dd>
              <strong>{gesamt.dateien}</strong>
            </dd>
            <dd>
              <strong>{gesamt.seiten}</strong>
            </dd>
            <dd>{gesamt.farbig}</dd>
            <dd>{gesamt.sw}</dd>
            <dd>{gesamt.bilder}</dd>
            <dd className={gesamt.fehler > 0 ? "msg-err" : undefined}>{gesamt.fehler}</dd>
          </div>

          <p className="count" style={{ marginTop: -8 }}>
            "Bilder (ungeprüft)": Seite enthält eingebettete Bilder, deren Farbigkeit ohne
            echtes Rendern nicht sicher feststellbar ist - realistisch sind davon die meisten
            farbig (z. B. Produktfotos).
          </p>

          {gruppen.map(([kategorie, dateien]) => {
            const summe = dateien.reduce(
              (acc, e) => ({
                seiten: acc.seiten + e.pageCount,
                farbig: acc.farbig + e.farbig,
                sw: acc.sw + e.sw,
                bilder: acc.bilder + e.bilderUngeprueft,
              }),
              { seiten: 0, farbig: 0, sw: 0, bilder: 0 },
            );
            return (
              <details key={kategorie} className="kachel-body">
                <summary className="gruppen-zeile kachel-summary">
                  <span className="gruppen-chevron">▸</span>
                  <strong>{kategorie}</strong>
                  <span className="count" style={{ marginLeft: 8 }}>
                    {dateien.length} {dateien.length === 1 ? "Datei" : "Dateien"} ·{" "}
                    {summe.seiten} Seiten · {summe.farbig} farbig · {summe.sw} s/w ·{" "}
                    {summe.bilder} Bilder (ungeprüft)
                  </span>
                </summary>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Datei</th>
                        <th style={{ textAlign: "right" }}>Seiten</th>
                        <th style={{ textAlign: "right" }}>farbig</th>
                        <th style={{ textAlign: "right" }}>s/w</th>
                        <th style={{ textAlign: "right" }}>Bilder (ungeprüft)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateien
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, "de"))
                        .map((d) => (
                          <tr key={d.name}>
                            <td>{d.name}</td>
                            {d.fehler ? (
                              <td colSpan={4} className="msg-err">
                                {d.fehler}
                              </td>
                            ) : (
                              <>
                                <td style={{ textAlign: "right" }}>{d.pageCount}</td>
                                <td style={{ textAlign: "right" }}>{d.farbig}</td>
                                <td style={{ textAlign: "right" }}>{d.sw}</td>
                                <td style={{ textAlign: "right" }}>{d.bilderUngeprueft}</td>
                              </>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </>
      )}
    </div>
  );
}
