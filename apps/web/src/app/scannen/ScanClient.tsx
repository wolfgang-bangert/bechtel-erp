"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { DOKUMENT_KATEGORIEN } from "@/lib/dokumente";
import { scanSpeichern, type ScanState } from "./actions";
import { FILTER_CSS, FILTER_LABEL, fotoVorbereiten, heute, pdfErzeugen, type Filter, type Seite } from "./bild";

type Ziel = "eingangsrechnung" | "dokument";
const leer: ScanState = {};

export function ScanClient({ startZiel, firmen }: { startZiel: Ziel; firmen: string[] }) {
  const [state, action, speichernd] = useActionState(scanSpeichern, leer);
  const [ziel, setZiel] = useState<Ziel>(startZiel);
  const [seiten, setSeiten] = useState<Seite[]>([]);
  const [standardFilter, setStandardFilter] = useState<Filter>("dokument");
  const [laedt, setLaedt] = useState(0);
  const [pdfSeite, setPdfSeite] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<ScanState | null>(null);
  const kameraRef = useRef<HTMLInputElement>(null);
  const fotosRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const seitenRef = useRef(seiten);
  seitenRef.current = seiten;

  // Vorschau-Bilder beim Verlassen der Seite freigeben
  useEffect(() => () => seitenRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  // Nach erfolgreichem Speichern: Seiten leeren, Erfolg anzeigen - bereit fürs nächste Dokument
  useEffect(() => {
    if (!state.ok) return;
    setErledigt(state);
    seitenRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    setSeiten([]);
    formRef.current?.reset();
  }, [state]);

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
        const b = await fotoVorbereiten(f);
        setSeiten((alt) => [...alt, { ...b, id: crypto.randomUUID(), drehung: 0, filter: standardFilter }]);
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
      if (weg) URL.revokeObjectURL(weg.url);
      return alt.filter((s) => s.id !== id);
    });
  const filterFuerAlle = (f: Filter) => {
    setStandardFilter(f);
    setSeiten((alt) => alt.map((s) => ({ ...s, filter: f })));
  };

  const speichern = async () => {
    if (!seiten.length || !formRef.current) return;
    setFehler(null);
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

      <div className="scan-aufnahme">
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
      </div>
      {!seiten.length && !laedt && (
        <p className="scan-tipp">
          Tipp: Blatt auf dunklen Untergrund legen, von oben fotografieren, Blatt möglichst formatfüllend. Mehrseitige
          Dokumente einfach Seite für Seite aufnehmen – alles wird zu einem PDF.
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
                <div className="scan-bild">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={`Seite ${i + 1}`}
                    style={{ transform: `rotate(${s.drehung}deg)`, filter: FILTER_CSS[s.filter] }}
                  />
                  <span className="scan-nr">{i + 1}</span>
                </div>
                <div className="scan-werkzeuge">
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
                {Object.entries(DOKUMENT_KATEGORIEN).map(([k, v]) => (
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

        <button type="submit" className="scan-speichern" disabled={!seiten.length || laedt > 0 || beschaeftigt}>
          {pdfSeite > 0
            ? `PDF wird erzeugt… Seite ${pdfSeite}/${seiten.length}`
            : speichernd
              ? "Wird hochgeladen…"
              : seiten.length
                ? `Speichern (${seiten.length} ${seiten.length === 1 ? "Seite" : "Seiten"})`
                : "Speichern"}
        </button>
      </form>
    </div>
  );
}
