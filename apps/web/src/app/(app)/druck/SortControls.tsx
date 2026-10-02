"use client";

import { useRouter, useSearchParams } from "next/navigation";

const DIMS: [string, string][] = [
  ["liefertermin", "Liefertermin"],
  ["loops", "Anzahl Loops"],
  ["spiralfarbe", "Farbe Spirale"],
  ["durchmesser", "Durchmesser"],
  ["teilung", "Teilung"],
  ["aufhaenger", "Aufhänger"],
  ["format", "Format"],
  ["faelligkeit", "Fälligkeit"],
  ["cello", "Cello"],
];

export function SortControls() {
  const router = useRouter();
  const sp = useSearchParams();

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.push(`/druck?${p.toString()}`);
  };

  const sel: React.CSSProperties = { padding: "5px 8px" };

  return (
    <div className="bd-actions" style={{ margin: "12px 0" }}>
      <span className="bd-mute">Gruppieren</span>
      <select className="bd-field-input" style={sel} value={sp.get("group") ?? ""} onChange={(e) => set("group", e.target.value)}>
        <option value="">– keine –</option>
        {DIMS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>

      {sp.get("group") && (
        <>
          <span className="bd-mute">Untergruppieren</span>
          <select className="bd-field-input" style={sel} value={sp.get("group2") ?? ""} onChange={(e) => set("group2", e.target.value)}>
            <option value="">– keine –</option>
            {DIMS.filter(([v]) => v !== sp.get("group")).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </>
      )}

      <span className="bd-mute">Sortieren</span>
      <select className="bd-field-input" style={sel} value={sp.get("sort") ?? ""} onChange={(e) => set("sort", e.target.value)}>
        <option value="">alle Kriterien</option>
        {DIMS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select className="bd-field-input" style={sel} value={sp.get("dir") ?? "asc"} onChange={(e) => set("dir", e.target.value)}>
        <option value="asc">▲ aufst.</option>
        <option value="desc">▼ abst.</option>
      </select>
    </div>
  );
}
