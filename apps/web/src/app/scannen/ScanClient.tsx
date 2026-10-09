"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { DOKUMENT_KATEGORIEN } from "@/lib/dokumente";
import { scanSpeichern, type ScanState } from "./actions";
import {
  FILTER_CSS,
  FILTER_LABEL,
  fotoVorbereiten,
  heute,
  pdfErzeugen,
  vorschauErzeugen,
  type Filter,
  type Seite,
} from "./bild";
import { EckenEditor } from "./EckenEditor";
import type { Ecken } from "./zuschnitt";

// Seiten-IDs per Zähler: crypto.randomUUID gibt es nur auf HTTPS und erst ab iOS 15.4
let naechsteId = 0;
const neueId = () => `s${++naechsteId}`;

/** Vorschau-/Foto-URLs einer Seite freigeben */
const freigeben = (s: Seite) => {
  URL.revokeObjectURL(s.url);
  if (s.vorschau) URL.revokeObjectURL(s.vorschau);
};

type Ziel = "eingangsrechnung" | "dokument";
const leer: ScanState = {};

export function ScanClient({ startZiel, firmen, darfPersonal }: { startZiel: Ziel; firmen: string[]; darfPersonal: boolean }) {
  const [state, action, speichernd] = useActionState(scanSpeichern, leer);
  const [ziel, setZiel] = useState<Ziel>(startZiel);
  const [seiten, setSeiten] = useState<Seite[]>([]);
  const [standardFilter, setStandardFilter] = useState<Filter>("dokument");
  const [autoZuschnitt, setAutoZuschnitt] = useState(true);
  const [bearbeiten, setBearbeiten] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(0);
  const [pdfSeite, setPdfSeite] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<ScanState | null>(null);
  // fertiges PDF (z. B. mit dem iPhone-Scanner der Dateien-App erstellt) - wird unverändert hochgeladen
  const [fertigPdf, setFertigPdf] = useState<{ file: File; seiten: number | null; url: string } | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const kameraRef = useRef<HTMLInputElement>(null);
  const fotosRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const seitenRef = useRef(seiten);
  seitenRef.current = seiten;

  // Vorschau-Bilder beim Verlassen der Seite freigeben
  useEffect(() => () => seitenRef.current.forEach(freigeben), []);

  // Nach erfolgreichem Speichern: Seiten leeren, Erfolg anzeigen - bereit fürs nächste Dokument
  useEffect(() => {
    if (!state.ok) return;
    setErledigt(state);
    seitenRef.current.forEach(freigeben);
    setSeiten([]);
    setFertigPdf((alt) => {
      if (alt) URL.revokeObjectURL(alt.url);
      return null;
    });
    formRef.current?.reset();
  }, [state]);

  const pdfWaehlen = async (liste: FileList | null) => {
    const f = liste?.[0];
    if (pdfRef.current) pdfRef.current.value = "";
    if (!f) return;
    setFehler(null);
    setErledigt(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      // echte PDFs beginnen (fast immer ganz vorne) mit "%PDF"
      if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF")) {
        setFehler(`„${f.name}“ ist kein PDF.`);
        return;
      }
      let anzahl: number | null = null;
      try {
        const { PDFDocument } = await import("pdf-lib");
        anzahl = (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
      } catch {
        // Seitenzahl ist nur Komfort - PDF trotzdem annehmen
      }
      setFertigPdf((alt) => {
        if (alt) URL.revokeObjectURL(alt.url);
        return { file: f, seiten: anzahl, url: URL.createObjectURL(f) };
      });
    } catch {
      setFehler(`„${f.name}“ konnte nicht gelesen werden.`);
    }
  };
  const pdfEntfernen = () =>
    setFertigPdf((alt) => {
      if (alt) URL.revokeObjectURL(alt.url);
      return null;
    });

  const fotosHinzufuegen = async (liste: FileList | null) => {
    const dateien = Array.from(liste ?? []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (kameraRef.current) kameraRef.current.value = "";
    if (fotosRef.current) fotosRef.current.value = "";
    if (!dateien.length) return;
    setFehler(null);
    setErledigt(null);
    setLaedt((x) => x + dateien.length);
    for (const f of dateien) {
      try {
        const b = await fotoVorbereiten(f, autoZuschnitt);
        setSeiten((alt) => [...alt, { ...b, id: neueId(), drehung: 0, filter: standardFilter }]);
      } catch {
        setFehler(`„${f.name}“ konnte nicht gelesen werden (Format wird vom Browser nicht unterstützt).`);
      } finally {
        setLaedt((x) => x - 1);
      }
    }
  };

  const aendern = (id: string, f: (s: Seite) => Seite) => setSeiten((alt) => alt.map((s) => (s.id === id ? f(s) : s)));
  const drehen = (id: string, um: 90 | -90) =>
    aendern(id, (s) => ({ ...s, drehung: (((s.drehung + um) % 360) + 360) % 360 as Seite["drehung"] }));
  const verschieben = (i: number, um: -1 | 1) =>
    setSeiten((alt) => {
      const j = i + um;
      if (j < 0 || j >= alt.length) return alt;
      const neu = [...alt];
      [neu[i], neu[j]] = [neu[j], neu[i]];
      return neu;
    });
  const entfernen = (id: string) =>
    setSeiten((alt) => {
      const weg = alt.find((s) => s.id === id);
      if (weg) freigeben(weg);
      return alt.filter((s) => s.id !== id);
    });
  const zuschnittUebernehmen = async (id: string, ecken: Ecken | null) => {
    setBearbeiten(null);
    const s = seitenRef.current.find((x) => x.id === id);
    if (!s) return;
    const vorschau = await vorschauErzeugen(s.url, s.w, s.h, ecken);
    setSeiten((alt) =>
      alt.map((x) => {
        if (x.id !== id) return x;
        if (x.vorschau) URL.revokeObjectURL(x.vorschau);
        return { ...x, ecken, vorschau };
      }),
    );
  };
  const bearbeitet = seiten.find((s) => s.id === bearbeiten);

  const filterFuerAlle = (f: Filter) => {
    setStandardFilter(f);
    setSeiten((alt) => alt.map((s) => ({ ...s, filter: f })));
  };

  const speichern = async () => {
    if (!formRef.current) return;
    setFehler(null);
    if (fertigPdf) {
      const fd = new FormData(formRef.current);
      fd.set("ziel", ziel);
      if (fertigPdf.seiten) fd.set("seiten", String(fertigPdf.seiten));
      // ohne eigenen Titel: Dateiname statt nur der Kategorie
      if (ziel === "dokument" && !String(fd.get("titel") ?? "").trim()) {
        fd.set("titel", fertigPdf.file.name.replace(/\.pdf$/i, ""));
      }
      fd.set("file", fertigPdf.file);
      startTransition(() => action(fd));
      return;
    }
    if (!seiten.length) return;
    try {
      const bytes = await pdfErzeugen(seiten, setPdfSeite);
      const fd = new FormData(formRef.current);
      const zeit = new Date();
      const stempel = `${heute()}_${String(zeit.getHours()).padStart(2, "0")}${String(zeit.getMinutes()).padStart(2, "0")}`;
      const name =
        ziel === "eingangsrechnung" ? `Scan_Eingangsrechnung_${stempel}.pdf` : `Scan_${fd.get("kategorie") ?? "Dokument"}_${stempel}.pdf`;
      fd.set("ziel", ziel);
      fd.set("seiten", String(seiten.length));
      fd.set("file", new File([bytes as BlobPart], name, { type: "application/pdf" }));
      startTransition(() => action(fd));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.");
    } finally {
      setPdfSeite(0);
    }
  };

  const beschaeftigt = speichernd || pdfSeite > 0;

  return (
    <div className="scan">
      <div className="scan-ziel" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={ziel === "eingangsrechnung"}
          className={ziel === "eingangsrechnung" ? "aktiv" : ""}
          onClick={() => setZiel("eingangsrechnung")}
        >
          Eingangsrechnung
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ziel === "dokument"}
          className={ziel === "dokument" ? "aktiv" : ""}
          onClick={() => setZiel("dokument")}
        >
          Rapport / Dokument
        </button>
      </div>
      <p className="scan-hinweis">
        {ziel === "eingangsrechnung"
          ? "Landet in den Eingangsrechnungen – die KI liest Lieferant, Beträge und Positionen aus."
          : "Landet in der Dokumentablage (Handwerker-Rapporte, Lieferscheine, Verträge …)."}
      </p>

      {erledigt?.ok && (
        <div className="scan-ok">
          {erledigt.doppelt
            ? "Dieses Dokument war schon erfasst – nicht doppelt gespeichert."
            : erledigt.ziel === "eingangsrechnung"
              ? "✓ Eingangsrechnung gespeichert, die Erkennung läuft."
              : "✓ Dokument abgelegt."}
          {erledigt.url && (
            <a href={erledigt.url} target="_blank" rel="noreferrer">
              PDF ansehen
            </a>
          )}
        </div>
      )}
      {(state.error || fehler) && <div className="scan-err">{fehler ?? state.error}</div>}

      {fertigPdf && (
        <div className="scan-pdf">
          <span className="scan-pdf-name">
            📄 {fertigPdf.file.name}
            {fertigPdf.seiten ? ` · ${fertigPdf.seiten} ${fertigPdf.seiten === 1 ? "Seite" : "Seiten"}` : ""}
          </span>
          <a href={fertigPdf.url} target="_blank" rel="noreferrer">
            Ansehen
          </a>
          <button type="button" className="scan-sekundaer" onClick={pdfEntfernen} disabled={beschaeftigt}>
            Entfernen
          </button>
        </div>
      )}

      <div className="scan-aufnahme" hidden={!!fertigPdf}>
        <button type="button" className="scan-kamera" disabled={beschaeftigt} onClick={() => kameraRef.current?.click()}>
          📷 {seiten.length ? "Nächste Seite fotografieren" : "Seite fotografieren"}
        </button>
        <button type="button" className="scan-sekundaer" disabled={beschaeftigt} onClick={() => fotosRef.current?.click()}>
          Aus Fotos wählen
        </button>
        <input
          ref={kameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => fotosHinzufuegen(e.target.files)}
        />
        <input ref={fotosRef} type="file" accept="image/*" multiple hidden onChange={(e) => fotosHinzufuegen(e.target.files)} />
        <button
          type="button"
          className="scan-sekundaer"
          disabled={beschaeftigt || seiten.length > 0 || laedt > 0}
          title={seiten.length ? "Erst die fotografierten Seiten speichern oder löschen" : undefined}
          onClick={() => pdfRef.current?.click()}
        >
          📄 Fertiges PDF wählen (z. B. iPhone-Scan)
        </button>
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pdfWaehlen(e.target.files)} />
      </div>
      <label className="scan-auto" hidden={!!fertigPdf}>
        <input type="checkbox" checked={autoZuschnitt} onChange={(e) => setAutoZuschnitt(e.target.checked)} />
        Blatt automatisch zuschneiden und gerade ziehen
      </label>
      {!seiten.length && !laedt && !fertigPdf && (
        <p className="scan-tipp">
          Tipp: Blatt auf einen dunkleren Untergrund legen und ganz aufs Foto nehmen – dann wird es automatisch
          ausgeschnitten und gerade gezogen. Antippen einer Seite öffnet den Zuschnitt zum Nachkorrigieren. Mehrseitige
          Dokumente einfach Seite für Seite aufnehmen – alles wird zu einem PDF. Schon mit dem iPhone gescannt (Dateien →
          „…“ → Dokumente scannen)? Dann „Fertiges PDF wählen“.
        </p>
      )}

      {(seiten.length > 0 || laedt > 0) && (
        <>
          <div className="scan-filter">
            <span>Darstellung:</span>
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={standardFilter === f ? "aktiv" : ""}
                onClick={() => filterFuerAlle(f)}
                disabled={beschaeftigt}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>

          <ol className="scan-seiten">
            {seiten.map((s, i) => (
              <li key={s.id} className="scan-seite">
                <div className="scan-bild" onClick={() => !beschaeftigt && setBearbeiten(s.id)} title="Zuschnitt bearbeiten">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.vorschau ?? s.url}
                    alt={`Seite ${i + 1}`}
                    style={{ transform: `rotate(${s.drehung}deg)`, filter: FILTER_CSS[s.filter] }}
                  />
                  <span className="scan-nr">{i + 1}</span>
                </div>
                <div className="scan-werkzeuge">
                  <button type="button" title="Zuschnitt bearbeiten" onClick={() => setBearbeiten(s.id)} disabled={beschaeftigt}>
                    ✂
                  </button>
                  <button type="button" title="nach links drehen" onClick={() => drehen(s.id, -90)} disabled={beschaeftigt}>
                    ↺
                  </button>
                  <button type="button" title="nach rechts drehen" onClick={() => drehen(s.id, 90)} disabled={beschaeftigt}>
                    ↻
                  </button>
                  <button type="button" title="nach vorne" onClick={() => verschieben(i, -1)} disabled={beschaeftigt || i === 0}>
                    ◀
                  </button>
                  <button
                    type="button"
                    title="nach hinten"
                    onClick={() => verschieben(i, 1)}
                    disabled={beschaeftigt || i === seiten.length - 1}
                  >
                    ▶
                  </button>
                  <button type="button" title="Seite löschen" className="weg" onClick={() => entfernen(s.id)} disabled={beschaeftigt}>
                    🗑
                  </button>
                </div>
              </li>
            ))}
            {Array.from({ length: laedt }, (_, i) => (
              <li key={`l${i}`} className="scan-seite laedt">
                <div className="scan-bild">wird geladen…</div>
              </li>
            ))}
          </ol>
        </>
      )}

      <form
        ref={formRef}
        className="scan-form"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        {ziel === "dokument" && (
          <>
            <label>
              Art
              <select name="kategorie" defaultValue="rapport">
                {Object.entries(DOKUMENT_KATEGORIEN).filter(([k]) => k !== "personal" || darfPersonal).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Firma / Handwerker
              <input name="partner" list="scan-firmen" autoComplete="off" placeholder="z. B. Elektro Müller" />
              <datalist id="scan-firmen">
                {firmen.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label>
              Titel
              <input name="titel" placeholder="z. B. Wartung Heizung Halle 2" />
            </label>
            <label>
              Datum des Dokuments
              <input name="datum" type="date" defaultValue={heute()} />
            </label>
            <label>
              Notiz
              <textarea name="notiz" rows={2} />
            </label>
          </>
        )}

        <button
          type="submit"
          className="scan-speichern"
          disabled={(!seiten.length && !fertigPdf) || laedt > 0 || beschaeftigt}
        >
          {fertigPdf
            ? speichernd
              ? "Wird hochgeladen…"
              : "PDF speichern"
            : pdfSeite > 0
            ? `PDF wird erzeugt… Seite ${pdfSeite}/${seiten.length}`
            : speichernd
              ? "Wird hochgeladen…"
              : seiten.length
                ? `Speichern (${seiten.length} ${seiten.length === 1 ? "Seite" : "Seiten"})`
                : "Speichern"}
        </button>
      </form>
      {bearbeitet && (
        <EckenEditor
          key={bearbeitet.id}
          seite={bearbeitet}
          onUebernehmen={(e) => zuschnittUebernehmen(bearbeitet.id, e)}
          onAbbrechen={() => setBearbeiten(null)}
        />
      )}
    </div>
  );
}
