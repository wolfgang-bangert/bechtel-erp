"use client";

import { useRouter, useSearchParams } from "next/navigation";

const DIMS: [string, string][] = [
  ["loops", "Anzahl Loops"],
  ["spiralfarbe", "Farbe Spirale"],
  ["durchmesser", "Durchmesser"],
  ["teilung", "Teilung"],
  ["aufhaenger", "Aufhänger"],
  ["format", "Format"],
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

  const sel: React.CSSProperties = { padding: "4px 6px" };

  return (
    <div className="toolbar" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span className="count">Gruppieren</span>
      <select style={sel} value={sp.get("group") ?? ""} onChange={(e) => set("group", e.target.value)}>
        <option value="">– keine –</option>
        {DIMS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>

      <span className="count">Sortieren</span>
      <select style={sel} value={sp.get("sort") ?? ""} onChange={(e) => set("sort", e.target.value)}>
        <option value="">alle Kriterien</option>
        {DIMS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select style={sel} value={sp.get("dir") ?? "asc"} onChange={(e) => set("dir", e.target.value)}>
        <option value="asc">▲ aufst.</option>
        <option value="desc">▼ abst.</option>
      </select>
    </div>
  );
}
