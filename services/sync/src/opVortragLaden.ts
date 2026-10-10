import { readFileSync } from "node:fs";
import { supabase } from "./supabase";

/**
 * Offene Posten zum 31.12.2025 laut BuchhaltungsButler in die Tabelle op_vortrag laden
 * (Forderungen: data/bb-op-forderungen-2025.json, Verbindlichkeiten: data/bb-op-2025.json).
 * Idempotent: upsert je (Stichtag, Art, Nummer, Partner).
 */
const STICHTAG = "2025-12-31";

export async function opVortragLaden(opts: { dryRun?: boolean } = {}) {
  const lies = <T,>(datei: string) => JSON.parse(readFileSync(new URL(`../data/${datei}`, import.meta.url), "utf8")) as T[];
  const ford = lies<{ nr: string; debitor: string; offen: number }>("bb-op-forderungen-2025.json").map((o) => ({
    stichtag: STICHTAG,
    art: "forderung",
    nummer: String(o.nr).trim(),
    partner_nr: String(o.debitor ?? "").trim() || null,
    offen: Math.round(Number(o.offen) * 100) / 100,
  }));
  const verb = lies<{ nr: string; kreditor: string; offen: number }>("bb-op-2025.json").map((o) => ({
    stichtag: STICHTAG,
    art: "verbindlichkeit",
    nummer: String(o.nr).trim(),
    partner_nr: String(o.kreditor ?? "").trim() || null,
    offen: Math.round(Number(o.offen) * 100) / 100,
  }));
  // doppelte Schlüssel in den Dateien zusammenfassen
  const zeilen = new Map<string, (typeof ford)[number]>();
  for (const z of [...ford, ...verb]) {
    const k = `${z.art}|${z.nummer}|${z.partner_nr}`;
    const alt = zeilen.get(k);
    zeilen.set(k, alt ? { ...alt, offen: Math.round((alt.offen + z.offen) * 100) / 100 } : z);
  }
  const alle = [...zeilen.values()];
  if (!opts.dryRun) {
    for (let i = 0; i < alle.length; i += 500) {
      const { error } = await supabase.from("op_vortrag").upsert(alle.slice(i, i + 500), { onConflict: "stichtag,art,nummer,partner_nr" });
      if (error) throw new Error(error.message);
    }
  }
  return { forderungen: ford.length, verbindlichkeiten: verb.length, geschrieben: alle.length, dryRun: !!opts.dryRun };
}
