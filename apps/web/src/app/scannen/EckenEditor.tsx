"use client";

import { useRef, useState } from "react";
import { eckenSuchen, type Seite } from "./bild";
import { GANZES_BILD, type Ecken } from "./zuschnitt";

/**
 * Vollbild-Editor für den Zuschnitt einer Seite: das Foto mit den vier Blatt-Ecken als Griffe, die
 * mit dem Finger verschoben werden. Außerhalb des Blatts wird abgedunkelt.
 */
export function EckenEditor({
  seite,
  onUebernehmen,
  onAbbrechen,
}: {
  seite: Seite;
  onUebernehmen: (ecken: Ecken | null) => void;
  onAbbrechen: () => void;
}) {
  const { w, h } = seite;
  const [ecken, setEcken] = useState<Ecken>(seite.ecken ?? GANZES_BILD);
  const [sucht, setSucht] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zieht = useRef<number | null>(null);

  const r = Math.max(w, h) * 0.03;
  const pkt = ecken.map((e) => ({ x: e.x * w, y: e.y * h }));
  const poly = pkt.map((p) => `${p.x},${p.y}`).join(" ");

  const bewegen = (ev: React.PointerEvent) => {
    const i = zieht.current;
    const svg = svgRef.current;
    if (i == null || !svg) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    const neu = [...ecken] as Ecken;
    neu[i] = { x: Math.min(1, Math.max(0, p.x / w)), y: Math.min(1, Math.max(0, p.y / h)) };
    setEcken(neu);
  };

  const automatisch = async () => {
    setSucht(true);
    setHinweis(null);
    try {
      const e = await eckenSuchen(seite.url, w, h);
      if (e) setEcken(e);
      else setHinweis("Kein Blatt erkannt – bitte die Ecken von Hand setzen.");
    } finally {
      setSucht(false);
    }
  };

  return (
    <div className="scan-editor" role="dialog" aria-label="Zuschnitt bearbeiten">
      <div className="scan-editor-kopf">
        Ecken mit dem Finger auf die Blattecken ziehen
        {hinweis && <span className="scan-editor-hinweis">{hinweis}</span>}
      </div>
      <div className="scan-editor-bild">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={bewegen}
          onPointerUp={() => (zieht.current = null)}
          onPointerCancel={() => (zieht.current = null)}
        >
          <image href={seite.url} x={0} y={0} width={w} height={h} />
          <path d={`M0 0H${w}V${h}H0Z M${poly.replace(/ /g, " L")}Z`} fillRule="evenodd" fill="rgba(0,0,0,0.5)" />
          <polygon points={poly} fill="none" stroke="#f39315" strokeWidth={r / 6} />
          {pkt.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={r} fill="rgba(243,147,21,0.25)" stroke="#f39315" strokeWidth={r / 6} />
              {/* großer, unsichtbarer Griff - leichter mit dem Finger zu treffen */}
              <circle
                cx={p.x}
                cy={p.y}
                r={r * 2.2}
                fill="transparent"
                style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(ev) => {
                  zieht.current = i;
                  svgRef.current?.setPointerCapture(ev.pointerId);
                }}
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="scan-editor-leiste">
        <button type="button" onClick={automatisch} disabled={sucht}>
          {sucht ? "Sucht…" : "Automatisch"}
        </button>
        <button type="button" onClick={() => setEcken(GANZES_BILD)}>
          Ganzes Bild
        </button>
        <button type="button" onClick={onAbbrechen}>
          Abbrechen
        </button>
        <button type="button" className="haupt" onClick={() => onUebernehmen(ecken)}>
          Übernehmen
        </button>
      </div>
    </div>
  );
}
